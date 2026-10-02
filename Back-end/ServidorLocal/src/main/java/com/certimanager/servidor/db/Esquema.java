package com.certimanager.servidor.db;

import com.certimanager.servidor.auth.Senhas;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Cria as tabelas na primeira execucao e semeia o usuario administrador padrao. */
public final class Esquema {

    public static final String EMAIL_ADMIN_PADRAO = "admin@admin.com";
    public static final String SENHA_ADMIN_PADRAO = "admin123";

    private Esquema() {
    }

    public static void inicializar(Banco banco) throws SQLException {
        inicializar(banco, EMAIL_ADMIN_PADRAO, SENHA_ADMIN_PADRAO);
    }

    /** O admin inicial so e criado num banco sem nenhum usuario (instalacao nova). */
    public static void inicializar(Banco banco, String emailAdminInicial, String senhaAdminInicial) throws SQLException {
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
                        telefone TEXT,
                        responsavel TEXT,
                        observacoes TEXT,
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

        adicionarColunasQueFaltam(banco);

        Object algumUsuario = banco.consultarUm("SELECT id FROM usuarios LIMIT 1");
        if (algumUsuario == null) {
            banco.executar(
                    "INSERT INTO usuarios (email, senha_hash, role) VALUES (?, ?, ?)",
                    emailAdminInicial, Senhas.gerarHash(senhaAdminInicial), 2
            );
        }
    }

    // Bancos criados (ou migrados) antes da ficha do cliente nao tem estas colunas.
    private static void adicionarColunasQueFaltam(Banco banco) throws SQLException {
        Set<String> existentes = new HashSet<>();
        try (Statement st = banco.bruta().createStatement();
             ResultSet colunas = st.executeQuery("PRAGMA table_info(certificados)")) {
            while (colunas.next()) {
                existentes.add(colunas.getString("name"));
            }
        }
        for (String coluna : List.of("telefone", "responsavel", "observacoes")) {
            if (!existentes.contains(coluna)) {
                try (Statement st = banco.bruta().createStatement()) {
                    st.execute("ALTER TABLE certificados ADD COLUMN " + coluna + " TEXT");
                }
            }
        }
    }
}
