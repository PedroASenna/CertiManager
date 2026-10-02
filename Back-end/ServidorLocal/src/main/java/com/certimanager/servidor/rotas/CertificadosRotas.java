package com.certimanager.servidor.rotas;

import com.certimanager.servidor.auth.AuthContexto;
import com.certimanager.servidor.auth.Sessao;
import com.certimanager.servidor.db.Auditoria;
import com.certimanager.servidor.db.Banco;
import io.javalin.config.RoutesConfig;
import io.javalin.http.BadRequestResponse;
import io.javalin.http.NotFoundResponse;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class CertificadosRotas {

    private static final List<String> CAMPOS_EDITAVEIS = List.of(
            "client_name", "doc_number", "expiry_date", "issue_date", "type", "password", "email_cliente",
            "telefone", "responsavel", "observacoes");

    private CertificadosRotas() {
    }

    public static void registrar(RoutesConfig routes, Banco banco, Auditoria auditoria) {
        routes.get("/api/certificates", ctx -> {
            List<Map<String, Object>> certificados = banco.consultar(
                    "SELECT * FROM certificados ORDER BY expiry_date ASC");
            ctx.json(certificados);
        });

        routes.post("/api/certificates", ctx -> {
            AuthContexto.exigirRole(ctx, 1);
            Map<?, ?> corpo = ctx.bodyAsClass(Map.class);
            String clientName = textoOuVazio(corpo, "client_name");
            String docNumber = textoOuVazio(corpo, "doc_number");

            Map<String, Object> existente = banco.consultarUm(
                    "SELECT id FROM certificados WHERE client_name = ? AND doc_number = ?", clientName, docNumber);
            if (existente != null) {
                throw new BadRequestResponse("Certificate already exists");
            }

            long id = banco.inserirRetornandoId("""
                    INSERT INTO certificados (client_name, doc_number, expiry_date, issue_date, type, password, email_cliente,
                                              telefone, responsavel, observacoes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    clientName, docNumber,
                    textoOuVazio(corpo, "expiry_date"), textoOuVazio(corpo, "issue_date"),
                    textoOuVazio(corpo, "type"), textoOuVazio(corpo, "password"), textoOuVazio(corpo, "email_cliente"),
                    textoOuVazio(corpo, "telefone"), textoOuVazio(corpo, "responsavel"), textoOuVazio(corpo, "observacoes"));

            Sessao sessao = AuthContexto.atual(ctx);
            auditoria.registrar(sessao.email(), "Adicionou o certificado de " + clientName);
            ctx.json(Map.of("id", id));
        });

        routes.put("/api/certificates/{id}", ctx -> {
            AuthContexto.exigirRole(ctx, 1);
            long id = Long.parseLong(ctx.pathParam("id"));
            Map<?, ?> corpo = ctx.bodyAsClass(Map.class);

            // So atualiza os campos enviados: a tela de renovacao manda apenas a nova data, e
            // sobrescrever o resto com vazio apagava nome, documento e senha do certificado.
            List<String> atribuicoes = new ArrayList<>();
            List<Object> valores = new ArrayList<>();
            for (String campo : CAMPOS_EDITAVEIS) {
                if (corpo.containsKey(campo)) {
                    atribuicoes.add(campo + " = ?");
                    valores.add(textoOuVazio(corpo, campo));
                }
            }
            if (atribuicoes.isEmpty()) {
                throw new BadRequestResponse("Nenhum campo para atualizar");
            }
            valores.add(id);

            int alterados = banco.executar(
                    "UPDATE certificados SET " + String.join(", ", atribuicoes) + " WHERE id = ?",
                    valores.toArray());
            if (alterados == 0) {
                throw new NotFoundResponse();
            }

            Sessao sessao = AuthContexto.atual(ctx);
            auditoria.registrar(sessao.email(), "Editou o certificado ID " + id);
            ctx.json(Map.of("success", true));
        });

        routes.delete("/api/certificates/{id}", ctx -> {
            // Excluir certificado e exclusivo do perfil Administrador (role 2).
            AuthContexto.exigirRole(ctx, 2);
            long id = Long.parseLong(ctx.pathParam("id"));
            Map<String, Object> certificado = banco.consultarUm(
                    "SELECT client_name, doc_number FROM certificados WHERE id = ?", id);
            if (certificado == null) {
                throw new NotFoundResponse();
            }
            banco.executar("DELETE FROM certificados WHERE id = ?", id);

            Sessao sessao = AuthContexto.atual(ctx);
            auditoria.registrar(sessao.email(), "Excluiu o certificado ID " + id + " de "
                    + certificado.get("client_name") + " (" + certificado.get("doc_number") + ")");
            ctx.json(Map.of("success", true));
        });
    }

    static String textoOuVazio(Map<?, ?> corpo, String campo) {
        Object valor = corpo.get(campo);
        return valor == null ? "" : String.valueOf(valor);
    }
}
