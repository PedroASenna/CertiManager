package com.certimanager.agente;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.Executors;

/**
 * Mini-servico que roda localmente em cada terminal (recepcao, fiscal, etc.) para ler o cartao A3
 * inserido no leitor USB daquela maquina e expor os certificados para o navegador via HTTP.
 *
 * O navegador nao pode acessar o cofre do Windows diretamente (trava de seguranca dos browsers),
 * entao o front-end chama este agente em http://localhost:8889 quando o usuario clica em
 * "Ler do Computador".
 */
public class AgenteTerminal {

    public static final int PORTA = 8889;

    private static final Gson GSON = new Gson();

    public static void main(String[] args) throws IOException {
        String versaoAtual = carregarVersao();
        String servidorCentralUrl = System.getenv().getOrDefault("CERTIMANAGER_SERVIDOR_URL", "http://localhost:8888");
        String origemPermitida = System.getenv().getOrDefault("CERTIMANAGER_CORS_ORIGIN", "*");
        long intervaloAtualizacaoHoras = Long.parseLong(System.getenv().getOrDefault("CERTIMANAGER_INTERVALO_ATUALIZACAO_HORAS", "4"));
        boolean autoUpdateHabilitado = !"false".equalsIgnoreCase(System.getenv("CERTIMANAGER_AUTO_UPDATE"));

        HttpServer servidor = HttpServer.create(new InetSocketAddress(PORTA), 0);
        servidor.createContext("/api/local-certs", exchange -> tratarLocalCerts(exchange, origemPermitida));
        servidor.createContext("/api/status", exchange -> tratarStatus(exchange, origemPermitida, versaoAtual));
        servidor.setExecutor(Executors.newFixedThreadPool(4));
        servidor.start();

        System.out.println("AgenteTerminal v" + versaoAtual + " ouvindo em http://localhost:" + PORTA);

        if (autoUpdateHabilitado) {
            AutoUpdater.iniciarVerificacaoPeriodica(servidorCentralUrl, versaoAtual, intervaloAtualizacaoHoras);
        } else {
            System.out.println("Auto-update desabilitado (CERTIMANAGER_AUTO_UPDATE=false).");
        }
    }

    private static void tratarLocalCerts(HttpExchange exchange, String origemPermitida) throws IOException {
        aplicarCors(exchange, origemPermitida);
        if (respondeuPreflight(exchange)) {
            return;
        }

        try {
            List<CertificadoInfo> certificados = CertificadoService.listarCertificados();
            responder(exchange, 200, GSON.toJson(certificados));
        } catch (Exception e) {
            String erro = GSON.toJson(Map.of(
                    "erro", "Nao foi possivel acessar o cofre de certificados do Windows.",
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
