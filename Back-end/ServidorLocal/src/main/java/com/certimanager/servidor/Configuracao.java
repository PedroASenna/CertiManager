package com.certimanager.servidor;

import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Resolve as pastas e opcoes do servidor. Cada opcao pode vir de uma propriedade de sistema
 * (usada pelos instaladores, via -Dcertimanager.*), de uma variavel de ambiente CERTIMANAGER_*,
 * ou cair no padrao relativo a pasta base. Sem nada configurado, a pasta base e o diretorio atual,
 * que e o comportamento de quem roda `java -jar` direto na pasta de instalacao.
 */
public final class Configuracao {

    // O instalador antigo (SaveStringToFile do Inno Setup) grava o config.ini em ANSI.
    private static final Charset ANSI_WINDOWS = Charset.forName("windows-1252");

    private final Path pastaBase;
    private final Map<String, String> configIni = new LinkedHashMap<>();
    private Charset charsetConfigIni = StandardCharsets.UTF_8;

    private Configuracao(Path pastaBase) {
        this.pastaBase = pastaBase;
    }

    public static Configuracao carregar() {
        String base = valor("CERTIMANAGER_HOME", "certimanager.home");
        Path pastaBase = (base == null ? Path.of("") : Path.of(expandirHome(base))).toAbsolutePath().normalize();
        Configuracao configuracao = new Configuracao(pastaBase);
        configuracao.lerConfigIni();
        return configuracao;
    }

    public Path pastaBase() {
        return pastaBase;
    }

    public Path arquivoBanco() {
        return caminho("CERTIMANAGER_DB_PATH", "certimanager.db", "database.sqlite");
    }

    public Path pastaReleases() {
        return caminho("CERTIMANAGER_RELEASES_DIR", "certimanager.releases", "releases");
    }

    public Path pastaBackups() {
        String doInstalador = configIni.get("PastaBackup");
        return caminho("CERTIMANAGER_BACKUPS_DIR", "certimanager.backups",
                doInstalador == null || doInstalador.isBlank() ? "backups" : doInstalador);
    }

    public Path pastaFrontend() {
        return caminho("CERTIMANAGER_FRONTEND_DIST_DIR", "certimanager.frontend", "frontend-dist");
    }

    /** Arquivo de log, quando o servidor roda sem console (instalado pelo .exe/.deb). */
    public Path arquivoLog() {
        String ativo = valor("CERTIMANAGER_LOG_EM_ARQUIVO", "certimanager.logEmArquivo");
        return "true".equalsIgnoreCase(ativo) ? pastaBase.resolve("logs").resolve("servidor.log") : null;
    }

    public boolean bandejaHabilitada() {
        return !"false".equalsIgnoreCase(valor("CERTIMANAGER_BANDEJA", "certimanager.bandeja"));
    }

    /** Login/senha escolhidos na tela "Administrador Principal" do instalador do Windows. */
    public String loginAdminInicial() {
        return configIni.get("Login");
    }

    public String senhaAdminInicial() {
        return configIni.get("Senha");
    }

    /**
     * O instalador grava a senha do admin em texto puro no config.ini. Depois que o banco ja
     * existe (com o admin criado, ou com usuarios de antes), essa linha nao serve para mais nada.
     */
    public void removerSenhaDoConfigIni() {
        Path arquivo = pastaBase.resolve("config.ini");
        if (!configIni.containsKey("Senha") || !Files.isRegularFile(arquivo)) {
            return;
        }
        try {
            List<String> linhasMantidas = new ArrayList<>();
            for (String linha : Files.readAllLines(arquivo, charsetConfigIni)) {
                if (!removerBom(linha).trim().startsWith("Senha=")) {
                    linhasMantidas.add(linha);
                }
            }
            Files.write(arquivo, linhasMantidas, charsetConfigIni);
            configIni.remove("Senha");
        } catch (IOException e) {
            System.err.println("Aviso: nao foi possivel remover a senha do config.ini: " + e.getMessage());
        }
    }

    private Path caminho(String variavelDeAmbiente, String propriedade, String padrao) {
        String configurado = valor(variavelDeAmbiente, propriedade);
        Path caminho = Path.of(expandirHome(configurado == null ? padrao : configurado));
        return pastaBase.resolve(caminho).toAbsolutePath().normalize();
    }

    private static String valor(String variavelDeAmbiente, String propriedade) {
        String valor = System.getProperty(propriedade);
        if (valor == null || valor.isBlank()) {
            valor = System.getenv(variavelDeAmbiente);
        }
        return valor == null || valor.isBlank() ? null : valor.trim();
    }

    private static String expandirHome(String caminho) {
        return caminho.startsWith("~") ? System.getProperty("user.home") + caminho.substring(1) : caminho;
    }

    // Formato "chave=valor" sem secoes, gerado pelo instalador. Nao usa java.util.Properties
    // porque ela trata "\" como escape e estragaria caminhos do Windows (C:\CertiManager\...).
    private void lerConfigIni() {
        Path arquivo = pastaBase.resolve("config.ini");
        if (!Files.isRegularFile(arquivo)) {
            return;
        }
        try {
            List<String> linhas;
            try {
                linhas = Files.readAllLines(arquivo, StandardCharsets.UTF_8);
            } catch (CharacterCodingException naoEUtf8) {
                charsetConfigIni = ANSI_WINDOWS;
                linhas = Files.readAllLines(arquivo, ANSI_WINDOWS);
            }
            for (String linha : linhas) {
                String limpa = removerBom(linha).trim();
                int igual = limpa.indexOf('=');
                if (igual > 0) {
                    configIni.put(limpa.substring(0, igual).trim(), limpa.substring(igual + 1).trim());
                }
            }
        } catch (IOException e) {
            System.err.println("Aviso: nao foi possivel ler " + arquivo + ": " + e.getMessage());
        }
    }

    private static String removerBom(String linha) {
        return linha.startsWith("\uFEFF") ? linha.substring(1) : linha;
    }
}
