package com.certimanager.servidor.auth;

import com.fasterxml.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** Assinatura e verificacao de tokens JWT (HS256), sem depender de nenhuma biblioteca de JWT. */
public final class Jwt {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Base64.Encoder BASE64_ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder BASE64_DEC = Base64.getUrlDecoder();
    private static final Map<String, String> CABECALHO = Map.of("alg", "HS256", "typ", "JWT");

    private final byte[] chaveSecreta;

    public Jwt(byte[] chaveSecreta) {
        this.chaveSecreta = chaveSecreta;
    }

    public String gerar(long id, String email, int role, Duration validade) {
        long expiraEm = Instant.now().plus(validade).getEpochSecond();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sub", id);
        payload.put("email", email);
        payload.put("role", role);
        payload.put("exp", expiraEm);

        String semAssinatura = codificar(CABECALHO) + "." + codificar(payload);
        String assinatura = BASE64_ENC.encodeToString(assinar(semAssinatura));
        return semAssinatura + "." + assinatura;
    }

    public Optional<Sessao> verificar(String token) {
        try {
            String[] partes = token.split("\\.");
            if (partes.length != 3) {
                return Optional.empty();
            }

            String semAssinatura = partes[0] + "." + partes[1];
            byte[] assinaturaEsperada = assinar(semAssinatura);
            byte[] assinaturaRecebida = BASE64_DEC.decode(partes[2]);
            if (!MessageDigest.isEqual(assinaturaEsperada, assinaturaRecebida)) {
                return Optional.empty();
            }

            Map<?, ?> payload = JSON.readValue(BASE64_DEC.decode(partes[1]), Map.class);
            long expiraEm = ((Number) payload.get("exp")).longValue();
            if (Instant.now().getEpochSecond() > expiraEm) {
                return Optional.empty();
            }

            long id = ((Number) payload.get("sub")).longValue();
            String email = (String) payload.get("email");
            int role = ((Number) payload.get("role")).intValue();
            return Optional.of(new Sessao(id, email, role));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private String codificar(Object valor) {
        try {
            return BASE64_ENC.encodeToString(JSON.writeValueAsBytes(valor));
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao codificar JWT", e);
        }
    }

    private byte[] assinar(String dado) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(chaveSecreta, "HmacSHA256"));
            return mac.doFinal(dado.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao assinar JWT", e);
        }
    }
}
