package com.certimanager.servidor.rotas;

import com.certimanager.servidor.auth.AuthContexto;
import com.certimanager.servidor.auth.Sessao;
import com.certimanager.servidor.db.Auditoria;
import com.certimanager.servidor.db.Banco;
import com.certimanager.servidor.db.BackupService;
import io.javalin.config.RoutesConfig;
import io.javalin.http.BadRequestResponse;
import io.javalin.http.UploadedFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.format.DateTimeFormatter;
import java.time.LocalDateTime;
import java.util.Map;

public final class ManutencaoRotas {

    private static final DateTimeFormatter FORMATO_ARQUIVO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH-mm-ss");

    private ManutencaoRotas() {
    }

    public static void registrar(RoutesConfig routes, Banco banco, Auditoria auditoria, Path pastaBackups) {
        routes.post("/api/garbage-collector", ctx -> {
            Sessao sessao = AuthContexto.exigirRole(ctx, 2);
            try {
                int removidos = banco.executar("""
                        DELETE FROM certificados
                        WHERE id IN (
                            SELECT id FROM certificados c1
                            WHERE expiry_date < date('now')
                            AND EXISTS (
                                SELECT 1 FROM certificados c2
                                WHERE c2.doc_number = c1.doc_number
                                AND c2.id != c1.id
                                AND c2.expiry_date >= date('now')
                            )
                        )
                        """);
                auditoria.registrar(sessao.email(), "Rodou a limpeza de duplicatas vencidas (" + removidos + " removidos)");
                ctx.json(Map.of("success", true, "message", removidos + " certificado(s) duplicado(s) e vencido(s) removido(s).", "removidos", removidos));
            } catch (Exception e) {
                ctx.status(500).json(Map.of("error", "Falha ao rodar a limpeza: " + e.getMessage()));
            }
        });

        routes.post("/api/backup", ctx -> {
            Sessao sessao = AuthContexto.exigirRole(ctx, 2);
            try {
                Files.createDirectories(pastaBackups);
                String dump = new BackupService(banco).gerarDump();
                String nomeArquivo = "backup-" + LocalDateTime.now().format(FORMATO_ARQUIVO) + ".sql";
                Files.writeString(pastaBackups.resolve(nomeArquivo), dump, StandardCharsets.UTF_8);

                auditoria.registrar(sessao.email(), "Gerou um backup do banco de dados (" + nomeArquivo + ")");
                ctx.json(Map.of("success", true, "file", nomeArquivo));
            } catch (Exception e) {
                ctx.status(500).json(Map.of("error", "Erro ao gerar backup: " + e.getMessage()));
            }
        });

        routes.post("/api/restore", ctx -> {
            Sessao sessao = AuthContexto.exigirRole(ctx, 2);
            UploadedFile arquivo = ctx.uploadedFile("file");
            if (arquivo == null) {
                throw new BadRequestResponse("Nenhum arquivo enviado");
            }

            try {
                String script = new String(arquivo.content().readAllBytes(), StandardCharsets.UTF_8);
                new BackupService(banco).restaurar(script);
                auditoria.registrar(sessao.email(), "Restaurou o banco de dados a partir de um backup");
                ctx.json(Map.of("success", true));
            } catch (IOException e) {
                ctx.status(400).json(Map.of("error", "Nao foi possivel ler o arquivo enviado."));
            } catch (Exception e) {
                ctx.status(500).json(Map.of("error", "Erro critico ao restaurar o banco de dados: " + e.getMessage()));
            }
        });
    }
}
