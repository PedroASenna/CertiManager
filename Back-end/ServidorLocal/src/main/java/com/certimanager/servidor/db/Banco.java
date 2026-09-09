package com.certimanager.servidor.db;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Acesso ao SQLite. SQLite nao lida bem com escritas concorrentes de multiplas conexoes, e este e
 * um sistema interno de baixo trafego (um escritorio), entao usamos uma unica conexao compartilhada
 * e sincronizamos o acesso em vez de montar um pool.
 */
public final class Banco {

    private final Connection conexao;

    public Banco(String caminhoArquivo) throws SQLException {
        this.conexao = DriverManager.getConnection("jdbc:sqlite:" + caminhoArquivo);
        try (Statement st = conexao.createStatement()) {
            st.execute("PRAGMA foreign_keys = ON");
            st.execute("PRAGMA journal_mode = WAL");
        }
    }

    public synchronized List<Map<String, Object>> consultar(String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = preparar(sql, params); ResultSet rs = ps.executeQuery()) {
            return paraListaDeMapas(rs);
        }
    }

    public synchronized Map<String, Object> consultarUm(String sql, Object... params) throws SQLException {
        List<Map<String, Object>> linhas = consultar(sql, params);
        return linhas.isEmpty() ? null : linhas.get(0);
    }

    public synchronized int executar(String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = preparar(sql, params)) {
            return ps.executeUpdate();
        }
    }

    public synchronized long inserirRetornandoId(String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = conexao.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            aplicarParametros(ps, params);
            ps.executeUpdate();
            try (ResultSet chaves = ps.getGeneratedKeys()) {
                return chaves.next() ? chaves.getLong(1) : -1;
            }
        }
    }

    /** Acesso a conexao bruta, para operacoes que precisam de transacao explicita (ex: restore). */
    public synchronized Connection bruta() {
        return conexao;
    }

    public synchronized void executarScript(List<String> comandosSql) throws SQLException {
        boolean autoCommitOriginal = conexao.getAutoCommit();
        conexao.setAutoCommit(false);
        try (Statement st = conexao.createStatement()) {
            for (String comando : comandosSql) {
                if (!comando.isBlank()) {
                    st.execute(comando);
                }
            }
            conexao.commit();
        } catch (SQLException e) {
            conexao.rollback();
            throw e;
        } finally {
            conexao.setAutoCommit(autoCommitOriginal);
        }
    }

    private PreparedStatement preparar(String sql, Object[] params) throws SQLException {
        PreparedStatement ps = conexao.prepareStatement(sql);
        aplicarParametros(ps, params);
        return ps;
    }

    private void aplicarParametros(PreparedStatement ps, Object[] params) throws SQLException {
        for (int i = 0; i < params.length; i++) {
            ps.setObject(i + 1, params[i]);
        }
    }

    private List<Map<String, Object>> paraListaDeMapas(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        int colunas = meta.getColumnCount();
        List<Map<String, Object>> linhas = new ArrayList<>();
        while (rs.next()) {
            Map<String, Object> linha = new LinkedHashMap<>();
            for (int i = 1; i <= colunas; i++) {
                linha.put(meta.getColumnLabel(i), rs.getObject(i));
            }
            linhas.add(linha);
        }
        return linhas;
    }
}
