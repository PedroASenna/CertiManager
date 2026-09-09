package com.certimanager.servidor.db;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Gera e restaura um dump em SQL puro das tabelas do sistema (backup/restore via arquivo .sql). */
public final class BackupService {

    private static final String[] TABELAS_EM_ORDEM = {"usuarios", "certificados", "logs", "config_email"};

    private final Banco banco;

    public BackupService(Banco banco) {
        this.banco = banco;
    }

    public String gerarDump() throws SQLException {
        StringBuilder dump = new StringBuilder();

        for (String tabela : TABELAS_EM_ORDEM) {
            dump.append("DELETE FROM ").append(tabela).append(";\n");
            List<Map<String, Object>> linhas = banco.consultar("SELECT * FROM " + tabela);
            for (Map<String, Object> linha : linhas) {
                dump.append(gerarInsert(tabela, linha)).append('\n');
            }
        }
        return dump.toString();
    }

    public void restaurar(String scriptSql) throws SQLException {
        banco.executarScript(dividirComandos(scriptSql));
    }

    private String gerarInsert(String tabela, Map<String, Object> linha) {
        StringBuilder colunas = new StringBuilder();
        StringBuilder valores = new StringBuilder();
        boolean primeiro = true;
        for (Map.Entry<String, Object> coluna : linha.entrySet()) {
            if (!primeiro) {
                colunas.append(", ");
                valores.append(", ");
            }
            colunas.append(coluna.getKey());
            valores.append(formatarValorSql(coluna.getValue()));
            primeiro = false;
        }
        return "INSERT INTO " + tabela + " (" + colunas + ") VALUES (" + valores + ");";
    }

    private String formatarValorSql(Object valor) {
        if (valor == null) {
            return "NULL";
        }
        if (valor instanceof Number) {
            return valor.toString();
        }
        return "'" + valor.toString().replace("'", "''") + "'";
    }

    /** Divide o script em comandos individuais, respeitando ';' dentro de strings entre aspas simples. */
    static List<String> dividirComandos(String script) {
        List<String> comandos = new ArrayList<>();
        StringBuilder atual = new StringBuilder();
        boolean dentroDeString = false;

        for (int i = 0; i < script.length(); i++) {
            char c = script.charAt(i);
            atual.append(c);
            if (c == '\'') {
                dentroDeString = !dentroDeString;
            } else if (c == ';' && !dentroDeString) {
                comandos.add(atual.toString());
                atual.setLength(0);
            }
        }
        if (!atual.toString().isBlank()) {
            comandos.add(atual.toString());
        }
        return comandos;
    }
}
