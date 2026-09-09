package com.certimanager.servidor.db;

import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/** Registra as acoes dos usuarios na tabela `logs`, exibida em "Registro de Atividades" no front-end. */
public final class Auditoria {

    private static final DateTimeFormatter FORMATO_DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");

    private final Banco banco;

    public Auditoria(Banco banco) {
        this.banco = banco;
    }

    public void registrar(String usuarioEmail, String acao) {
        try {
            banco.executar(
                    "INSERT INTO logs (data_hora, usuario, acao) VALUES (?, ?, ?)",
                    LocalDateTime.now().format(FORMATO_DATA_HORA), usuarioEmail, acao
            );
        } catch (SQLException e) {
            System.err.println("Falha ao registrar log de auditoria: " + e.getMessage());
        }
    }
}
