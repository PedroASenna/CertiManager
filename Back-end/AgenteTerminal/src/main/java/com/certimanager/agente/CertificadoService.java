package com.certimanager.agente;

import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;

/** Le os certificados do cofre nativo do Windows (Windows-MY / MSCAPI) via o driver do leitor A3. */
public final class CertificadoService {

    private CertificadoService() {
    }

    public static List<CertificadoInfo> listarCertificados() throws Exception {
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
}
