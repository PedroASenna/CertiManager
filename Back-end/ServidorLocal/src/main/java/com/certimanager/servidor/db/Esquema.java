package com.certimanager.servidor.db;

import com.certimanager.servidor.auth.Senhas;

import java.sql.SQLException;
import java.sql.Statement;

/** Cria as tabelas na primeira execucao e semeia o usuario administrador padrao. */
public final class Esquema {

    public static final String EMAIL_ADMIN_PADRAO = "admin@admin.com";
    public static final String SENHA_ADMIN_PADRAO = "admin123";

    private Esquema() {
    }

    public static void inicializar(Banco banco) throws SQLException {
        try (Statement st = banco.bruta().createStatement()) {
            st.execute("""
                    CREATE TABLE IF NOT EXISTS usuarios (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        email TEXT UNIQUE NOT NULL,
                        senha_hash TEXT NOT NULL,
                        role INTEGER NOT NULL DEFAULT 0
                    )
                    """);
            st.execute("""
                    CREATE TABLE IF NOT EXISTS certificados (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        client_name TEXT,
                        doc_number TEXT,
                        expiry_date TEXT,
                        issue_date TEXT,
                        type TEXT,
                        password TEXT,
                        email_cliente TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                    """);
            st.execute("""
                    CREATE TABLE IF NOT EXISTS logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        data_hora TEXT,
                        usuario TEXT,
                        acao TEXT
                    )
                    """);
            st.execute("""
                    CREATE TABLE IF NOT EXISTS config_email (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        email_remetente TEXT,
                        senha_app TEXT,
                        modo_disparo TEXT,
                        email_equipe TEXT
                    )
                    """);
        }

        Object existeAdmin = banco.consultarUm("SELECT id FROM usuarios WHERE email = ?", EMAIL_ADMIN_PADRAO);
        if (existeAdmin == null) {
            banco.executar(
                    "INSERT INTO usuarios (email, senha_hash, role) VALUES (?, ?, ?)",
                    EMAIL_ADMIN_PADRAO, Senhas.gerarHash(SENHA_ADMIN_PADRAO), 2
            );
        }
    }
}
