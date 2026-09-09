package com.certimanager.servidor.auth;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.Base64;

/** Hash de senha com PBKDF2 (biblioteca padrao do JDK, sem dependencia externa de bcrypt). */
public final class Senhas {

    private static final int ITERACOES = 210_000;
    private static final int TAMANHO_CHAVE_BITS = 256;
    private static final SecureRandom ALEATORIO = new SecureRandom();

    private Senhas() {
    }

    public static String gerarHash(String senha) {
        byte[] sal = new byte[16];
        ALEATORIO.nextBytes(sal);
        byte[] hash = derivar(senha, sal);
        return Base64.getEncoder().encodeToString(sal) + ":" + Base64.getEncoder().encodeToString(hash);
    }

    public static boolean confere(String senha, String hashArmazenado) {
        if (hashArmazenado == null || !hashArmazenado.contains(":")) {
            return false;
        }
        String[] partes = hashArmazenado.split(":", 2);
        byte[] sal = Base64.getDecoder().decode(partes[0]);
        byte[] hashEsperado = Base64.getDecoder().decode(partes[1]);
        byte[] hashCalculado = derivar(senha, sal);
        return java.security.MessageDigest.isEqual(hashEsperado, hashCalculado);
    }

    private static byte[] derivar(String senha, byte[] sal) {
        try {
            PBEKeySpec spec = new PBEKeySpec(senha.toCharArray(), sal, ITERACOES, TAMANHO_CHAVE_BITS);
            SecretKeyFactory fabrica = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return fabrica.generateSecret(spec).getEncoded();
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            throw new IllegalStateException("Falha ao gerar hash de senha", e);
        }
    }
}
