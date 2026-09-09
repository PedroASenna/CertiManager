package com.certimanager.servidor.rotas;

import com.certimanager.servidor.auth.Jwt;
import com.certimanager.servidor.auth.Senhas;
import com.certimanager.servidor.db.Banco;
import io.javalin.config.RoutesConfig;
import io.javalin.http.UnauthorizedResponse;

import java.time.Duration;
import java.util.Map;

public final class AutenticacaoRotas {

    private AutenticacaoRotas() {
    }

    public static void registrar(RoutesConfig routes, Banco banco, Jwt jwt) {
        routes.post("/api/login", ctx -> {
            Map<?, ?> corpo = ctx.bodyAsClass(Map.class);
            String email = String.valueOf(corpo.get("email"));
            String senha = String.valueOf(corpo.get("password"));

            Map<String, Object> usuario = banco.consultarUm("SELECT * FROM usuarios WHERE email = ?", email);
            if (usuario == null || !Senhas.confere(senha, (String) usuario.get("senha_hash"))) {
                throw new UnauthorizedResponse("Credenciais invalidas");
            }

            long id = ((Number) usuario.get("id")).longValue();
            int role = ((Number) usuario.get("role")).intValue();
            String token = jwt.gerar(id, email, role, Duration.ofHours(12));

            ctx.json(Map.of("token", token, "user", Map.of("email", email, "role", role)));
        });
    }
}
