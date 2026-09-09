package com.certimanager.servidor.rotas;

import io.javalin.config.RoutesConfig;
import io.javalin.http.BadRequestResponse;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.regex.Pattern;

/** Proxy para a ReceitaWS: o front-end nao pode chamar direto por CORS. Rota publica, sem autenticacao. */
public final class CnpjRotas {

    private static final Pattern CNPJ_OU_CPF_VALIDO = Pattern.compile("\\d{11,14}");
    private static final HttpClient CLIENTE_HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private CnpjRotas() {
    }

    public static void registrar(RoutesConfig routes) {
        routes.get("/api/cnpj/{cnpj}", ctx -> {
            String cnpj = ctx.pathParam("cnpj");
            if (!CNPJ_OU_CPF_VALIDO.matcher(cnpj).matches()) {
                throw new BadRequestResponse("CNPJ invalido");
            }

            try {
                HttpRequest requisicao = HttpRequest.newBuilder(URI.create("https://receitaws.com.br/v1/cnpj/" + cnpj))
                        .timeout(Duration.ofSeconds(15))
                        .GET()
                        .build();
                HttpResponse<String> resposta = CLIENTE_HTTP.send(requisicao, HttpResponse.BodyHandlers.ofString());
                ctx.status(resposta.statusCode()).contentType("application/json").result(resposta.body());
            } catch (Exception e) {
                ctx.status(500).json(Map.of("error", "Erro ao consultar CNPJ"));
            }
        });
    }
}
