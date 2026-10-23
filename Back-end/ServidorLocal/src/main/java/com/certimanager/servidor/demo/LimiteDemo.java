package com.certimanager.servidor.demo;

import com.certimanager.servidor.db.Banco;
import io.javalin.http.ForbiddenResponse;

import java.sql.SQLException;
import java.util.Map;

/**
 * Limite de certificados da versao de demonstracao. So e ligado quando o servidor sobe com
 * -Dcertimanager.demo=true, CERTIMANAGER_MODO_DEMO=true ou "Demo=true" no config.ini. Fora do modo
 * demo nao faz nada, entao a instalacao de producao nao e afetada.
 *
 * Ao atingir o limite, a criacao de novos certificados responde com a mesma mensagem de falta de
 * nivel de acesso que as outras areas restritas. Edicoes e exclusoes continuam funcionando.
 */
public final class LimiteDemo {

    public static final int LIMITE_PADRAO = 10;
    public static final String MENSAGEM = "Nivel de acesso insuficiente";

    private final boolean ativo;
    private final int limite;
    private final Banco banco;

    public LimiteDemo(boolean ativo, int limite, Banco banco) {
        this.ativo = ativo;
        this.limite = limite;
        this.banco = banco;
    }

    public boolean ativo() {
        return ativo;
    }

    public int limite() {
        return limite;
    }

    /** Verdadeiro se ainda cabem {@code quantidade} certificados novos dentro do limite. */
    public boolean cabem(int quantidade) throws SQLException {
        if (!ativo) {
            return true;
        }
        Map<String, Object> contagem = banco.consultarUm("SELECT COUNT(*) AS total FROM certificados");
        long total = ((Number) contagem.get("total")).longValue();
        return total + quantidade <= limite;
    }

    /** Responde 403 se a criacao de um certificado ultrapassaria o limite. */
    public void exigirEspacoParaNovoCertificado() throws SQLException {
        if (!cabem(1)) {
            throw new ForbiddenResponse(MENSAGEM);
        }
    }
}
