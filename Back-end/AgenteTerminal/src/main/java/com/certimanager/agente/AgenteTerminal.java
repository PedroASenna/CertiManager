package com.certimanager.agente;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.net.BindException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.Executors;

/**
 * Mini-servico que roda localmente em cada terminal (recepcao, fiscal, etc.) para ler o cartao A3
 * inserido no leitor USB daquela maquina e expor os certificados para o navegador via HTTP.
 * Funciona no Windows (cofre MSCAPI) e no Linux (driver PKCS#11 do cartao).
 *
 * O navegador nao pode acessar o cartao diretamente (trava de seguranca dos browsers),
 * entao o front-end chama este agente em http://localhost:8889 quando o usuario clica em
 * "Ler do Computador".
 */
public class AgenteTerminal {

    public static final int PORTA = 8889;

    private static final Gson GSON = new Gson();

    public static void main(String[] args) throws IOException {
        redirecionarLogParaArquivo();
        ConfiguracaoAgente config = ConfiguracaoAgente.carregar();
        String versaoAtual = carregarVersao();
        String servidorCentralUrl = config.servidorUrl();
        String origemPermitida = config.origemPermitida();

        // So o navegador deste computador chama o agente (http://localhost:8889): nao abre a porta
        // para a rede, senao qualquer maquina do escritorio veria os certificados deste cartao.
        HttpServer servidor;
        try {
            servidor = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), PORTA), 0);
        } catch (BindException jaRodando) {
            System.out.println("A porta " + PORTA + " ja esta em uso: o AgenteTerminal ja esta rodando neste computador.");
            return;
        }
        servidor.createContext("/api/local-certs", exchange -> tratarLocalCerts(exchange, origemPermitida, config));
        servidor.createContext("/api/status", exchange -> tratarStatus(exchange, origemPermitida, versaoAtual));
        servidor.setExecutor(Executors.newFixedThreadPool(4));
        servidor.start();

        System.out.println("AgenteTerminal v" + versaoAtual + " ouvindo em http://localhost:" + PORTA
                + " (servidor central: " + servidorCentralUrl + ")");

        if (config.autoUpdateHabilitado()) {
            AutoUpdater.iniciarVerificacaoPeriodica(servidorCentralUrl, versaoAtual, config.intervaloAtualizacaoHoras());
        } else {
            System.out.println("Auto-update desabilitado (CERTIMANAGER_AUTO_UPDATE=false).");
        }
    }

    /** Instalado pelo .exe/.deb o agente roda sem console: grava a saida em -Dcertimanager.log. */
    private static void redirecionarLogParaArquivo() {
        String caminho = System.getProperty("certimanager.log");
        if (caminho == null || caminho.isBlank()) {
            return;
        }
        try {
            Path arquivo = Path.of(ConfiguracaoAgente.expandirHome(caminho.trim()));
            Files.createDirectories(arquivo.toAbsolutePath().getParent());
            // Comeca de novo quando passa de 5 MB, para o log nao crescer para sempre
            boolean anexar = !Files.exists(arquivo) || Files.size(arquivo) < 5L * 1024 * 1024;
            PrintStream log = new PrintStream(new FileOutputStream(arquivo.toFile(), anexar), true, StandardCharsets.UTF_8);
            System.setOut(log);
            System.setErr(log);
        } catch (IOException | RuntimeException e) {
            System.err.println("Aviso: nao foi possivel gravar o log em " + caminho + ": " + e.getMessage());
        }
    }

    private static void tratarLocalCerts(HttpExchange exchange, String origemPermitida, ConfiguracaoAgente config) throws IOException {
        aplicarCors(exchange, origemPermitida);
        if (respondeuPreflight(exchange)) {
            return;
        }

        try {
            List<CertificadoInfo> certificados = CertificadoService.listarCertificados(config);
            responder(exchange, 200, GSON.toJson(certificados));
        } catch (Exception e) {
            String erro = GSON.toJson(Map.of(
                    "erro", "Nao foi possivel ler os certificados do cartao/token deste computador.",
                    "detalhe", String.valueOf(e.getMessage())
            ));
            responder(exchange, 500, erro);
        }
    }

    private static void tratarStatus(HttpExchange exchange, String origemPermitida, String versaoAtual) throws IOException {
        aplicarCors(exchange, origemPermitida);
        if (respondeuPreflight(exchange)) {
            return;
        }
        responder(exchange, 200, GSON.toJson(Map.of("status", "online", "versao", versaoAtual)));
    }

    private static boolean respondeuPreflight(HttpExchange exchange) throws IOException {
        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return true;
        }
        return false;
    }

    private static void aplicarCors(HttpExchange exchange, String origemPermitida) {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", origemPermitida);
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
        // O site vem do servidor (http://ip-do-servidor:8888) e chama o localhost: o Chrome pede esta
        // permissao ("Private Network Access") antes de deixar uma pagina da rede falar com o localhost.
        exchange.getResponseHeaders().add("Access-Control-Allow-Private-Network", "true");
    }

    private static void responder(HttpExchange exchange, int codigoStatus, String corpoJson) throws IOException {
        byte[] bytes = corpoJson.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(codigoStatus, bytes.length);
        try (var saida = exchange.getResponseBody()) {
            saida.write(bytes);
        }
    }

    static String carregarVersao() {
        Properties propriedades = new Properties();
        try (InputStream entrada = AgenteTerminal.class.getResourceAsStream("/versao.properties")) {
            if (entrada != null) {
                propriedades.load(entrada);
            }
        } catch (IOException e) {
            // segue com versao "desconhecida" abaixo; nao impede o agente de subir
        }
        return propriedades.getProperty("versao", "0.0.0");
    }
}
