package com.certimanager.agente;

import com.google.gson.Gson;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Verifica periodicamente no ServidorLocal se existe uma versao mais nova do AgenteTerminal e,
 * se existir, baixa o novo jar e o aplica sozinho (reinstala o servico e reinicia).
 *
 * Contrato esperado do ServidorLocal central:
 *   GET {servidorCentralUrl}/api/agente/versao
 *   -> 200 { "versao": "1.1.0", "url": "http://.../downloads/AgenteTerminal-1.1.0.jar", "sha256": "<hex>" }
 */
public final class AutoUpdater {

    private static final String NOME_SERVICO = "AgenteTerminal";
    private static final HttpClient CLIENTE_HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private static final Gson GSON = new Gson();

    private record VersaoRemota(String versao, String url, String sha256) {
    }

    private AutoUpdater() {
    }

    /** Agenda a verificacao de atualizacao para rodar logo na subida e depois a cada N horas. */
    public static void iniciarVerificacaoPeriodica(String servidorCentralUrl, String versaoAtual, long intervaloHoras) {
        ScheduledExecutorService agendador = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "auto-updater");
            t.setDaemon(true);
            return t;
        });

        agendador.scheduleWithFixedDelay(
                () -> verificarEAplicarSeNecessario(servidorCentralUrl, versaoAtual),
                30, // pequena espera para o servidor HTTP local subir antes de tentar
                TimeUnit.SECONDS.convert(intervaloHoras, TimeUnit.HOURS),
                TimeUnit.SECONDS
        );
    }

    private static void verificarEAplicarSeNecessario(String servidorCentralUrl, String versaoAtual) {
        try {
            VersaoRemota remota = buscarVersaoRemota(servidorCentralUrl);
            if (remota == null || !ehMaisNova(remota.versao(), versaoAtual)) {
                log("Nenhuma atualizacao disponivel (atual=" + versaoAtual + ").");
                return;
            }

            log("Nova versao disponivel: " + remota.versao() + " (atual: " + versaoAtual + "). Baixando...");
            aplicarAtualizacao(remota);
        } catch (Exception e) {
            // Servidor fora do ar, rede instavel, etc. Nao derruba o agente: tenta de novo no proximo ciclo.
            log("Falha ao verificar atualizacao (" + e.getMessage() + "). Nova tentativa no proximo ciclo.");
        }
    }

    private static VersaoRemota buscarVersaoRemota(String servidorCentralUrl) throws IOException, InterruptedException {
        HttpRequest requisicao = HttpRequest.newBuilder(URI.create(servidorCentralUrl + "/api/agente/versao"))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();

        HttpResponse<String> resposta = CLIENTE_HTTP.send(requisicao, HttpResponse.BodyHandlers.ofString());
        if (resposta.statusCode() != 200) {
            throw new IOException("Servidor central respondeu " + resposta.statusCode());
        }
        return GSON.fromJson(resposta.body(), VersaoRemota.class);
    }

    private static void aplicarAtualizacao(VersaoRemota remota) throws IOException, InterruptedException, NoSuchAlgorithmException, URISyntaxException {
        Path jarAtual = localizarJarAtualOuNull();
        if (jarAtual == null) {
            log("Atualizacao automatica desabilitada: o agente nao esta rodando a partir de um .jar empacotado (provavelmente execucao via IDE).");
            return;
        }

        Path pasta = jarAtual.getParent();
        Path jarNovo = pasta.resolve("AgenteTerminal.novo.jar");

        baixarArquivo(remota.url(), jarNovo);

        String hashCalculado = calcularSha256(jarNovo);
        if (!hashCalculado.equalsIgnoreCase(remota.sha256())) {
            Files.deleteIfExists(jarNovo);
            log("Atualizacao abortada: SHA-256 do arquivo baixado nao confere com o esperado (possivel download corrompido ou incompleto).");
            return;
        }

        Path scriptAplicador = gerarScriptAplicador(pasta, jarAtual, jarNovo);
        lancarScriptDesacoplado(scriptAplicador, pasta);

        log("Atualizacao baixada e validada. Reiniciando para aplicar a versao " + remota.versao() + "...");
        System.exit(0); // libera o lock do jar atual para o script substituir o arquivo
    }

    private static Path localizarJarAtualOuNull() throws URISyntaxException {
        URI localizacao = AgenteTerminal.class.getProtectionDomain().getCodeSource().getLocation().toURI();
        Path caminho = Path.of(localizacao);
        return Files.isRegularFile(caminho) ? caminho : null;
    }

    private static void baixarArquivo(String url, Path destino) throws IOException, InterruptedException {
        HttpRequest requisicao = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMinutes(2))
                .GET()
                .build();
        HttpResponse<Path> resposta = CLIENTE_HTTP.send(requisicao, HttpResponse.BodyHandlers.ofFile(
                destino, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING));
        if (resposta.statusCode() != 200) {
            Files.deleteIfExists(destino);
            throw new IOException("Download da atualizacao falhou com HTTP " + resposta.statusCode());
        }
    }

    private static String calcularSha256(Path arquivo) throws IOException, NoSuchAlgorithmException {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (var entrada = Files.newInputStream(arquivo)) {
            byte[] buffer = new byte[8192];
            int lidos;
            while ((lidos = entrada.read(buffer)) != -1) {
                digest.update(buffer, 0, lidos);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /**
     * Gera um .bat que espera o processo Java atual encerrar, troca o jar antigo pelo novo e
     * reinicia o AgenteTerminal — como servico do Windows (se instalado) ou como processo solto.
     * O proprio script se apaga no final.
     */
    private static Path gerarScriptAplicador(Path pasta, Path jarAtual, Path jarNovo) throws IOException {
        Path script = pasta.resolve("aplicar-atualizacao.bat");
        String conteudo = """
                @echo off
                setlocal
                set SERVICO=%s
                set JAR_ANTIGO=%s
                set JAR_NOVO=%s

                timeout /t 3 /nobreak >nul

                sc query %%SERVICO%% >nul 2>&1
                if %%ERRORLEVEL%%==0 (
                    net stop %%SERVICO%% >nul 2>&1
                    timeout /t 2 /nobreak >nul
                    move /y "%%JAR_NOVO%%" "%%JAR_ANTIGO%%" >nul
                    net start %%SERVICO%% >nul 2>&1
                ) else (
                    move /y "%%JAR_NOVO%%" "%%JAR_ANTIGO%%" >nul
                    start "" /min javaw -jar "%%JAR_ANTIGO%%"
                )

                del "%%~f0"
                """.formatted(NOME_SERVICO, jarAtual, jarNovo);

        Files.writeString(script, conteudo, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        return script;
    }

    private static void lancarScriptDesacoplado(Path script, Path pasta) throws IOException {
        new ProcessBuilder("cmd.exe", "/c", "start", "\"\"", "/min", script.toString())
                .directory(pasta.toFile())
                .start();
    }

    /** Compara versoes no formato "1.2.3" (numero de segmentos pode variar). */
    static boolean ehMaisNova(String remota, String local) {
        String[] r = remota.split("\\.");
        String[] l = local.split("\\.");
        int tamanho = Math.max(r.length, l.length);
        for (int i = 0; i < tamanho; i++) {
            int valorRemoto = i < r.length ? parseIntSeguro(r[i]) : 0;
            int valorLocal = i < l.length ? parseIntSeguro(l[i]) : 0;
            if (valorRemoto != valorLocal) {
                return valorRemoto > valorLocal;
            }
        }
        return false;
    }

    private static int parseIntSeguro(String valor) {
        try {
            return Integer.parseInt(valor.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static void log(String mensagem) {
        System.out.println("[AutoUpdater " + LocalDateTime.now() + "] " + mensagem);
    }
}
