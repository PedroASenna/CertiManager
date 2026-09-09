package com.certimanager.servidor.rotas;

import com.certimanager.servidor.auth.AuthContexto;
import com.certimanager.servidor.db.Banco;
import io.javalin.config.RoutesConfig;

import java.util.Map;

public final class ConfigEmailRotas {

    private ConfigEmailRotas() {
    }

    public static void registrar(RoutesConfig routes, Banco banco) {
        routes.get("/api/config-email", ctx -> {
            Map<String, Object> config = banco.consultarUm("SELECT * FROM config_email WHERE id = 1");
            ctx.json(config == null ? Map.of() : config);
        });

        routes.post("/api/config-email", ctx -> {
            AuthContexto.exigirRole(ctx, 2);
            Map<?, ?> corpo = ctx.bodyAsClass(Map.class);

            banco.executar("""
                    INSERT INTO config_email (id, email_remetente, senha_app, modo_disparo, email_equipe)
                    VALUES (1, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        email_remetente = excluded.email_remetente,
                        senha_app = excluded.senha_app,
                        modo_disparo = excluded.modo_disparo,
                        email_equipe = excluded.email_equipe
                    """,
                    texto(corpo, "email_remetente"), texto(corpo, "senha_app"),
                    texto(corpo, "modo_disparo"), texto(corpo, "email_equipe"));

            ctx.json(Map.of("success", true));
        });
    }

    private static String texto(Map<?, ?> corpo, String campo) {
        Object valor = corpo.get(campo);
        return valor == null ? "" : String.valueOf(valor);
    }
}
