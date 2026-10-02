package com.certimanager.agente;

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
 * Opcoes do agente. Cada uma pode vir de uma variavel de ambiente CERTIMANAGER_* (tem prioridade)
 * ou do arquivo de configuracao que o instalador grava, apontado por -Dcertimanager.config:
 *   Windows: C:\CertiManager-Terminal\config.ini      Linux: /etc/certimanager/terminal.conf
 * Formato "chave=valor", uma por linha (ex.: Servidor=http://192.168.1.50:8888).
 */
public final class ConfiguracaoAgente {

    private final Map<String, String> arquivo;

    private ConfiguracaoAgente(Map<String, String> arquivo) {
        this.arquivo = arquivo;
    }

    public static ConfiguracaoAgente carregar() {
        String caminho = System.getProperty("certimanager.config");
        Map<String, String> valores = new LinkedHashMap<>();
        if (caminho != null && !caminho.isBlank()) {
            lerArquivo(Path.of(expandirHome(caminho.trim())), valores);
        }
        return new ConfiguracaoAgente(valores);
    }

    /** Endereco do ServidorLocal (de onde vem a atualizacao automatica). */
    public String servidorUrl() {
        String url = valor("CERTIMANAGER_SERVIDOR_URL", "Servidor", "http://localhost:8888");
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    public String origemPermitida() {
        return valor("CERTIMANAGER_CORS_ORIGIN", "OrigemPermitida", "*");
    }

    public long intervaloAtualizacaoHoras() {
        return Long.parseLong(valor("CERTIMANAGER_INTERVALO_ATUALIZACAO_HORAS", "IntervaloAtualizacaoHoras", "4"));
    }

    public boolean autoUpdateHabilitado() {
        return !"false".equalsIgnoreCase(valor("CERTIMANAGER_AUTO_UPDATE", "AutoUpdate", "true"));
    }

    /** Drivers PKCS#11 extras do cartao/token (Linux), separados por ";" ou ":". */
    public List<String> modulosPkcs11() {
        List<String> modulos = new ArrayList<>();
        String configurado = valor("CERTIMANAGER_PKCS11", "Pkcs11", "");
        for (String modulo : configurado.split("[;:]")) {
            if (!modulo.isBlank()) {
                modulos.add(modulo.trim());
            }
        }
        return modulos;
    }

    private String valor(String variavelDeAmbiente, String chave, String padrao) {
        String valor = System.getenv(variavelDeAmbiente);
        if (valor == null || valor.isBlank()) {
            valor = arquivo.get(chave);
        }
        return valor == null || valor.isBlank() ? padrao : valor.trim();
    }

    // Nao usa java.util.Properties porque ela trata "\" como escape e estragaria caminhos do Windows.
    private static void lerArquivo(Path caminho, Map<String, String> valores) {
        if (!Files.isRegularFile(caminho)) {
            return;
        }
        try {
            List<String> linhas;
            try {
                linhas = Files.readAllLines(caminho, StandardCharsets.UTF_8);
            } catch (CharacterCodingException naoEUtf8) {
                linhas = Files.readAllLines(caminho, Charset.forName("windows-1252"));
            }
            for (String linha : linhas) {
                String limpa = linha.replace("\uFEFF", "").trim();
                int igual = limpa.indexOf('=');
                if (igual <= 0 || limpa.startsWith("#") || limpa.startsWith(";")) {
                    continue;
                }
                String valor = limpa.substring(igual + 1).trim();
                // O terminal.conf do Linux tambem e lido pelo shell, entao o valor pode vir entre aspas
                if (valor.length() >= 2 && (valor.startsWith("\"") && valor.endsWith("\"")
                        || valor.startsWith("'") && valor.endsWith("'"))) {
                    valor = valor.substring(1, valor.length() - 1);
                }
                valores.put(limpa.substring(0, igual).trim(), valor);
            }
        } catch (IOException e) {
            System.err.println("Aviso: nao foi possivel ler " + caminho + ": " + e.getMessage());
        }
    }

    static String expandirHome(String caminho) {
        return caminho.startsWith("~") ? System.getProperty("user.home") + caminho.substring(1) : caminho;
    }
}
