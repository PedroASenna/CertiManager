package com.certimanager.servidor.auth;

import io.javalin.http.Context;
import io.javalin.http.ForbiddenResponse;

/** Helpers para ler a sessao autenticada (colocada pelo filtro `before`) dentro de uma rota. */
public final class AuthContexto {

    private static final String ATRIBUTO_SESSAO = "sessao";

    private AuthContexto() {
    }

    public static void definir(Context ctx, Sessao sessao) {
        ctx.attribute(ATRIBUTO_SESSAO, sessao);
    }

    public static Sessao atual(Context ctx) {
        return ctx.attribute(ATRIBUTO_SESSAO);
    }

    /** Retorna a sessao se o nivel de acesso for suficiente, ou lanca 403. */
    public static Sessao exigirRole(Context ctx, int nivelMinimo) {
        Sessao sessao = atual(ctx);
        if (sessao == null || sessao.role() < nivelMinimo) {
            throw new ForbiddenResponse("Nivel de acesso insuficiente");
        }
        return sessao;
    }
}
