package com.certimanager.servidor.ferramentas;

import com.certimanager.servidor.auth.Senhas;
import com.certimanager.servidor.db.Banco;
import com.certimanager.servidor.db.Esquema;

import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * Ferramenta de linha de comando, uso unico: migra os dados de uma instalacao antiga do
 * CertiManager (tabelas usuarios/certificados/logs/configuracoes_email em portugues, senhas em
 * texto puro, datas de vencimento em epoch-ms ou texto ISO misturados) para o schema do
 * ServidorLocal novo (ver Esquema.java).
 *
 * O epoch-ms das datas de vencimento antigas foi gravado sempre as 03:00 UTC, que e meia-noite
 * em America/Sao_Paulo — ou seja, sao datas locais mal serializadas. Convertemos usando esse fuso
 * para recuperar a data pretendida corretamente, em vez de usar UTC (que erraria o dia).
 *
 * Uso: java -cp ServidorLocal.jar com.certimanager.servidor.ferramentas.MigradorBancoAntigo <banco-antigo.db> <database.sqlite-novo>
 */
public final class MigradorBancoAntigo {

    private static final ZoneId FUSO_BRASIL = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter FORMATO_DATA_HORA_ANTIGO = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter FORMATO_DATA_HORA_NOVO = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");

    private MigradorBancoAntigo() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.out.println("Uso: java -cp ServidorLocal.jar com.certimanager.servidor.ferramentas.MigradorBancoAntigo <banco-antigo.db> <database.sqlite-novo>");
            return;
        }

        Banco antigo = new Banco(args[0]);
        Banco novo = new Banco(args[1]);
        Esquema.inicializar(novo);
        novo.executar("DELETE FROM usuarios WHERE email = ?", Esquema.EMAIL_ADMIN_PADRAO);

        int usuarios = migrarUsuarios(antigo, novo);
        int certificados = migrarCertificados(antigo, novo);
        int logs = migrarLogs(antigo, novo);
        int configs = migrarConfigEmail(antigo, novo);

        System.out.println("Migracao concluida: " + usuarios + " usuario(s), " + certificados
                + " certificado(s), " + logs + " log(s), " + configs + " configuracao(oes) de e-mail.");
    }

    private static int migrarUsuarios(Banco antigo, Banco novo) throws SQLException {
        List<Map<String, Object>> linhas = antigo.consultar("SELECT id, login, senha, nivel FROM usuarios");
        for (Map<String, Object> linha : linhas) {
            novo.executar("INSERT INTO usuarios (id, email, senha_hash, role) VALUES (?, ?, ?, ?)",
                    linha.get("id"), linha.get("login"),
                    Senhas.gerarHash(String.valueOf(linha.get("senha"))), linha.get("nivel"));
        }
        return linhas.size();
    }

    private static int migrarCertificados(Banco antigo, Banco novo) throws SQLException {
        List<Map<String, Object>> linhas = antigo.consultar("""
                SELECT id, nome, cpf_cnpj, tipo, senha, data_vencimento,
                       typeof(data_vencimento) AS tipo_data, email_cliente
                FROM certificados
                """);
        for (Map<String, Object> linha : linhas) {
            String dataVencimento = converterDataVencimento(linha.get("data_vencimento"), String.valueOf(linha.get("tipo_data")));
            novo.executar("""
                    INSERT INTO certificados (id, client_name, doc_number, expiry_date, issue_date, type, password, email_cliente)
                    VALUES (?, ?, ?, ?, '', ?, ?, ?)
                    """,
                    linha.get("id"), linha.get("nome"), linha.get("cpf_cnpj"), dataVencimento,
                    linha.get("tipo"), linha.get("senha"), linha.get("email_cliente"));
        }
        return linhas.size();
    }

    private static String converterDataVencimento(Object valor, String tipoSqlite) {
        if ("integer".equals(tipoSqlite)) {
            long epochMs = ((Number) valor).longValue();
            LocalDate data = Instant.ofEpochMilli(epochMs).atZone(FUSO_BRASIL).toLocalDate();
            return data.toString();
        }
        return String.valueOf(valor);
    }

    private static int migrarLogs(Banco antigo, Banco novo) throws SQLException {
        List<Map<String, Object>> linhas = antigo.consultar("SELECT id, usuario, acao, data_hora FROM logs");
        for (Map<String, Object> linha : linhas) {
            String dataHoraConvertida;
            try {
                dataHoraConvertida = FORMATO_DATA_HORA_NOVO.format(
                        FORMATO_DATA_HORA_ANTIGO.parse(String.valueOf(linha.get("data_hora"))));
            } catch (Exception e) {
                dataHoraConvertida = String.valueOf(linha.get("data_hora"));
            }
            novo.executar("INSERT INTO logs (id, data_hora, usuario, acao) VALUES (?, ?, ?, ?)",
                    linha.get("id"), dataHoraConvertida, linha.get("usuario"), linha.get("acao"));
        }
        return linhas.size();
    }

    private static int migrarConfigEmail(Banco antigo, Banco novo) throws SQLException {
        List<Map<String, Object>> linhas = antigo.consultar(
                "SELECT email_remetente, senha_app, modo_disparo, email_equipe FROM configuracoes_email LIMIT 1");
        if (linhas.isEmpty()) {
            return 0;
        }
        Map<String, Object> linha = linhas.get(0);
        novo.executar("""
                INSERT INTO config_email (id, email_remetente, senha_app, modo_disparo, email_equipe)
                VALUES (1, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    email_remetente = excluded.email_remetente,
                    senha_app = excluded.senha_app,
                    modo_disparo = excluded.modo_disparo,
                    email_equipe = excluded.email_equipe
                """,
                linha.get("email_remetente"), linha.get("senha_app"), linha.get("modo_disparo"), linha.get("email_equipe"));
        return 1;
    }
}
