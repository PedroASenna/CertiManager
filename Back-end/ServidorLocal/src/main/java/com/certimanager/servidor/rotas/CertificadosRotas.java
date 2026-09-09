package com.certimanager.servidor.rotas;

import com.certimanager.servidor.auth.AuthContexto;
import com.certimanager.servidor.auth.Sessao;
import com.certimanager.servidor.db.Auditoria;
import com.certimanager.servidor.db.Banco;
import io.javalin.config.RoutesConfig;
import io.javalin.http.BadRequestResponse;

import java.util.List;
import java.util.Map;

public final class CertificadosRotas {

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
                    INSERT INTO certificados (client_name, doc_number, expiry_date, issue_date, type, password, email_cliente)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    clientName, docNumber,
                    textoOuVazio(corpo, "expiry_date"), textoOuVazio(corpo, "issue_date"),
                    textoOuVazio(corpo, "type"), textoOuVazio(corpo, "password"), textoOuVazio(corpo, "email_cliente"));

            Sessao sessao = AuthContexto.atual(ctx);
            auditoria.registrar(sessao.email(), "Adicionou o certificado de " + clientName);
            ctx.json(Map.of("id", id));
        });

        routes.put("/api/certificates/{id}", ctx -> {
            AuthContexto.exigirRole(ctx, 1);
            long id = Long.parseLong(ctx.pathParam("id"));
            Map<?, ?> corpo = ctx.bodyAsClass(Map.class);

            banco.executar("""
                    UPDATE certificados
                    SET client_name = ?, doc_number = ?, expiry_date = ?, issue_date = ?, type = ?, password = ?, email_cliente = ?
                    WHERE id = ?
                    """,
                    textoOuVazio(corpo, "client_name"), textoOuVazio(corpo, "doc_number"),
                    textoOuVazio(corpo, "expiry_date"), textoOuVazio(corpo, "issue_date"),
                    textoOuVazio(corpo, "type"), textoOuVazio(corpo, "password"),
                    textoOuVazio(corpo, "email_cliente"), id);

            Sessao sessao = AuthContexto.atual(ctx);
            auditoria.registrar(sessao.email(), "Editou o certificado ID " + id);
            ctx.json(Map.of("success", true));
        });

        routes.delete("/api/certificates/{id}", ctx -> {
            AuthContexto.exigirRole(ctx, 2);
            long id = Long.parseLong(ctx.pathParam("id"));
            banco.executar("DELETE FROM certificados WHERE id = ?", id);

            Sessao sessao = AuthContexto.atual(ctx);
            auditoria.registrar(sessao.email(), "Removeu o certificado ID " + id);
            ctx.json(Map.of("success", true));
        });
    }

    static String textoOuVazio(Map<?, ?> corpo, String campo) {
        Object valor = corpo.get(campo);
        return valor == null ? "" : String.valueOf(valor);
    }
}
