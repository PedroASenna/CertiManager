package com.certimanager.agente;

/** Um certificado (A1 ou A3) encontrado no cofre de chaves do Windows (MSCAPI). */
public record CertificadoInfo(
        String alias,
        String subjectDN,
        String validoAte,
        String numeroSerie
) {
}
