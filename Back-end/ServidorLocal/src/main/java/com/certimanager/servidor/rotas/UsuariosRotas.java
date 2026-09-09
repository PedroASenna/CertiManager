package com.certimanager.servidor.rotas;

import com.certimanager.servidor.auth.AuthContexto;
import com.certimanager.servidor.auth.Senhas;
import com.certimanager.servidor.auth.Sessao;
import com.certimanager.servidor.db.Auditoria;
import com.certimanager.servidor.db.Banco;
import io.javalin.config.RoutesConfig;
import io.javalin.http.BadRequestResponse;
import io.javalin.http.ForbiddenResponse;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * O front-end (UsersModal em App.tsx) usa os nomes de campo em portugues "login"/"senha"/"nivel"
 * para esta tela, mesmo o login em si usando "email"/"password" (ver AutenticacaoRotas). Aqui
 * aceitamos as duas variantes e sempre devolvemos "login"/"nivel", que e o que a tela espera.
 */
public final class UsuariosRotas {

    private UsuariosRotas() {
    }

    public static void registrar(RoutesConfig routes, Banco banco, Auditoria auditoria) {
        routes.get("/api/users", ctx -> {
            AuthContexto.exigirRole(ctx, 2);
            List<Map<String, Object>> usuarios = banco.consultar("SELECT id, email, role FROM usuarios ORDER BY id");
            ctx.json(usuarios.stream()
                    .map(u -> Map.of("id", u.get("id"), "login", u.get("email"), "nivel", u.get("role")))
                    .collect(Collectors.toList()));
        });

        routes.post("/api/users", ctx -> {
            Sessao sessaoAtual = AuthContexto.exigirRole(ctx, 2);
            Map<?, ?> corpo = ctx.bodyAsClass(Map.class);

            String email = String.valueOf(primeiroNaoNulo(corpo, "login", "email"));
            String senha = String.valueOf(primeiroNaoNulo(corpo, "senha", "password"));
            int role = Integer.parseInt(String.valueOf(primeiroNaoNulo(corpo, "nivel", "role")));

            if (email == null || email.isBlank() || senha == null || senha.isBlank()) {
                throw new BadRequestResponse("Login e senha sao obrigatorios");
            }

            Map<String, Object> existente = banco.consultarUm("SELECT id FROM usuarios WHERE email = ?", email);
            if (existente != null) {
                throw new BadRequestResponse("Ja existe um usuario com esse login");
            }

            long id = banco.inserirRetornandoId(
                    "INSERT INTO usuarios (email, senha_hash, role) VALUES (?, ?, ?)",
                    email, Senhas.gerarHash(senha), role);

            auditoria.registrar(sessaoAtual.email(), "Criou o acesso de " + email + " (nivel " + role + ")");
            ctx.json(Map.of("id", id));
        });

        routes.delete("/api/users/{id}", ctx -> {
            Sessao sessaoAtual = AuthContexto.exigirRole(ctx, 2);
            long id = Long.parseLong(ctx.pathParam("id"));
            if (id == 1) {
                throw new ForbiddenResponse("O usuario administrador padrao nao pode ser removido");
            }

            banco.executar("DELETE FROM usuarios WHERE id = ?", id);
            auditoria.registrar(sessaoAtual.email(), "Removeu o acesso do usuario ID " + id);
            ctx.json(Map.of("success", true));
        });
    }

    private static Object primeiroNaoNulo(Map<?, ?> corpo, String... campos) {
        for (String campo : campos) {
            Object valor = corpo.get(campo);
            if (valor != null) {
                return valor;
            }
        }
        return null;
    }
}
