package com.certimanager.agente;

import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;

/**
 * Le os certificados do cartao/token A3 deste computador: no Windows, pelo cofre nativo
 * (Windows-MY / MSCAPI), onde o driver do leitor publica o cartao; no Linux, pelo driver
 * PKCS#11 do cartao (ver {@link LeitorPkcs11}).
 */
public final class CertificadoService {

    private CertificadoService() {
    }

    public static List<CertificadoInfo> listarCertificados(ConfiguracaoAgente config) throws Exception {
        if (!ehWindows()) {
            return LeitorPkcs11.listar(config.modulosPkcs11());
        }

        List<CertificadoInfo> certificados = new ArrayList<>();

        KeyStore cofre = KeyStore.getInstance("Windows-MY");
        cofre.load(null, null);

        Enumeration<String> aliases = cofre.aliases();
        while (aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            Certificate certificado = cofre.getCertificate(alias);
            if (certificado instanceof X509Certificate x509) {
                certificados.add(new CertificadoInfo(
                        alias,
                        x509.getSubjectX500Principal().getName(),
                        DateTimeFormatter.ISO_INSTANT.format(x509.getNotAfter().toInstant()),
                        x509.getSerialNumber().toString(16)
                ));
            }
        }

        return certificados;
    }

    static boolean ehWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("windows");
    }
}
