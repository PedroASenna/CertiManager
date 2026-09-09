package com.certimanager.servidor.rotas;

import com.certimanager.servidor.db.Banco;
import io.javalin.config.RoutesConfig;

public final class LogsRotas {

    private LogsRotas() {
    }

    public static void registrar(RoutesConfig routes, Banco banco) {
        routes.get("/api/logs", ctx ->
                ctx.json(banco.consultar("SELECT * FROM logs ORDER BY id DESC LIMIT 500")));
    }
}
