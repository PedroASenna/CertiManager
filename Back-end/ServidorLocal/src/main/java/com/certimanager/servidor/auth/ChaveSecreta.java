package com.certimanager.servidor.auth;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Resolve o segredo usado para assinar os tokens JWT: usa CERTIMANAGER_JWT_SECRET se definido,
 * senao gera um segredo aleatorio na primeira execucao e o persiste em disco (para os tokens
 * continuarem validos entre reinicializacoes do servidor sem precisar de um segredo fixo no codigo).
 */
public final class ChaveSecreta {

    private ChaveSecreta() {
    }

    public static byte[] resolver(Path arquivoPersistencia) throws IOException {
        String daVariavelDeAmbiente = System.getenv("CERTIMANAGER_JWT_SECRET");
        if (daVariavelDeAmbiente != null && !daVariavelDeAmbiente.isBlank()) {
            return daVariavelDeAmbiente.getBytes();
        }

        if (Files.isRegularFile(arquivoPersistencia)) {
            return Base64.getDecoder().decode(Files.readString(arquivoPersistencia).trim());
        }

        byte[] segredo = new byte[32];
        new SecureRandom().nextBytes(segredo);
        Files.writeString(arquivoPersistencia, Base64.getEncoder().encodeToString(segredo));
        return segredo;
    }
}
