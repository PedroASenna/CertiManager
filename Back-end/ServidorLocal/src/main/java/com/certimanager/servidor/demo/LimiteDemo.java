package com.certimanager.servidor.demo;

import com.certimanager.servidor.db.Banco;
import io.javalin.http.ForbiddenResponse;

import java.sql.SQLException;
import java.util.Map;

/**
 * Limite de certificados da versao DEMO. Existe somente no branch versao-demo: o branch principal
 * nao tem nenhum limite.
 *
 * Ao atingir o limite, criar um certificado (manual ou por importacao em lote) responde com a mesma
 * mensagem de falta de nivel de acesso usada nas outras areas restritas. Editar e apagar continuam
 * funcionando; apagar um certificado libera uma vaga.
 */
public final class LimiteDemo {

    public static final int LIMITE_PADRAO = 10;
    public static final String MENSAGEM = "Nivel de acesso insuficiente";

    private final int limite;
    private final Banco banco;

    public LimiteDemo(int limite, Banco banco) {
        this.limite = limite;
        this.banco = banco;
    }

    public int limite() {
        return limite;
    }

    /** Verdadeiro se ainda cabem {@code quantidade} certificados novos dentro do limite. */
    public boolean cabem(int quantidade) throws SQLException {
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
