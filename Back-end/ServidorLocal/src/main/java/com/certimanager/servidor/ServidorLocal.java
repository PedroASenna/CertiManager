package com.certimanager.servidor;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Servidor central do CertiManager (porta 8888).
 *
 * Este modulo cobre, por enquanto, apenas a distribuicao de novas versoes do AgenteTerminal
 * (o que os terminais consultam para se auto-atualizar): publicar um .jar novo em `releases/`
 * e ele passa a ser servido automaticamente. O restante do ServidorLocal descrito no README
 * (banco SQLite, robo de e-mails, hospedagem do Front-end) ainda esta por implementar.
 */
public class ServidorLocal {

    public static final int PORTA = 8888;

    private static final Gson GSON = new Gson();
    private static final Pattern NOME_ARQUIVO_VALIDO = Pattern.compile("AgenteTerminal-\\d+\\.\\d+\\.\\d+\\.jar");

    public static void main(String[] args) throws IOException {
        Path pastaReleases = Path.of(System.getenv().getOrDefault("CERTIMANAGER_RELEASES_DIR", "releases"))
                .toAbsolutePath()
                .normalize();
        Files.createDirectories(pastaReleases);

        RepositorioReleases repositorio = new RepositorioReleases(pastaReleases);

        HttpServer servidor = HttpServer.create(new InetSocketAddress(PORTA), 0);
        servidor.createContext("/api/agente/versao", exchange -> tratarVersaoAgente(exchange, repositorio));
        servidor.createContext("/downloads/", exchange -> tratarDownload(exchange, pastaReleases));
        servidor.setExecutor(Executors.newFixedThreadPool(4));
        servidor.start();

        System.out.println("ServidorLocal ouvindo em http://localhost:" + PORTA);
        System.out.println("Pasta de releases do AgenteTerminal: " + pastaReleases);
    }

    private static void tratarVersaoAgente(HttpExchange exchange, RepositorioReleases repositorio) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            exchange.close();
            return;
        }

        try {
            Optional<VersaoPublicada> versao = repositorio.versaoMaisRecente();
            if (versao.isEmpty()) {
                responder(exchange, 404, GSON.toJson(Map.of(
                        "erro", "Nenhuma versao do AgenteTerminal publicada ainda em releases/."
                )));
                return;
            }

            VersaoPublicada publicada = versao.get();
            String hash = repositorio.sha256De(publicada.arquivo());
            String host = exchange.getRequestHeaders().getFirst("Host");
            if (host == null || host.isBlank()) {
                host = "localhost:" + PORTA;
            }
            String url = "http://" + host + "/downloads/" + publicada.arquivo().getFileName();

            responder(exchange, 200, GSON.toJson(Map.of(
                    "versao", publicada.versao(),
                    "url", url,
                    "sha256", hash
            )));
        } catch (Exception e) {
            responder(exchange, 500, GSON.toJson(Map.of(
                    "erro", "Falha ao consultar a versao publicada do AgenteTerminal.",
                    "detalhe", String.valueOf(e.getMessage())
            )));
        }
    }

    private static void tratarDownload(HttpExchange exchange, Path pastaReleases) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            exchange.close();
            return;
        }

        String caminho = exchange.getRequestURI().getPath();
        String prefixo = "/downloads/";
        String nomeArquivo = caminho.startsWith(prefixo) ? caminho.substring(prefixo.length()) : "";

        if (!NOME_ARQUIVO_VALIDO.matcher(nomeArquivo).matches()) {
            exchange.sendResponseHeaders(400, -1);
            exchange.close();
            return;
        }

        Path arquivo = pastaReleases.resolve(nomeArquivo).normalize();
        if (!arquivo.startsWith(pastaReleases) || !Files.isRegularFile(arquivo)) {
            exchange.sendResponseHeaders(404, -1);
            exchange.close();
            return;
        }

        exchange.getResponseHeaders().add("Content-Type", "application/java-archive");
        exchange.sendResponseHeaders(200, Files.size(arquivo));
        try (var saida = exchange.getResponseBody()) {
            Files.copy(arquivo, saida);
        }
    }

    private static void responder(HttpExchange exchange, int codigoStatus, String corpoJson) throws IOException {
        byte[] bytes = corpoJson.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(codigoStatus, bytes.length);
        try (var saida = exchange.getResponseBody()) {
            saida.write(bytes);
        }
    }
}
