package com.certimanager.agente;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Leitura do cartao/token A3 no Linux. Fora do Windows nao existe o cofre "Windows-MY": o driver
 * do fabricante (ou o OpenSC) e uma biblioteca PKCS#11. Os certificados sao objetos publicos do
 * cartao, entao da para listar sem pedir o PIN, usando o pkcs11-tool (pacote opensc).
 */
final class LeitorPkcs11 {

    /** Drivers mais comuns dos cartoes/tokens ICP-Brasil, na ordem de preferencia. */
    static final List<String> MODULOS_CONHECIDOS = List.of(
            "/usr/lib/libeTPkcs11.so",                          // SafeNet eToken (SafeNet Authentication Client)
            "/usr/lib64/libeTPkcs11.so",
            "/usr/lib/libaetpkss.so",                           // G&D SafeSign
            "/usr/lib64/libaetpkss.so",
            "/usr/lib/watchdata/ICP/lib/libwdpkcs_icp.so",      // Watchdata ICP-Brasil
            "/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so",       // OpenSC (generico)
            "/usr/lib64/opensc-pkcs11.so",
            "/usr/lib/opensc-pkcs11.so"
    );

    private static final Pattern SLOT = Pattern.compile("^Slot \\d+ \\((0x[0-9a-fA-F]+)\\)");
    private static final Pattern CAMPO = Pattern.compile("^\\s+([A-Za-z ]+?):\\s*(.*)$");
    private static final long TEMPO_LIMITE_SEGUNDOS = 30;

    private LeitorPkcs11() {
    }

    static List<CertificadoInfo> listar(List<String> modulosConfigurados) throws IOException, InterruptedException {
        List<String> modulos = modulosDisponiveis(modulosConfigurados);
        if (modulos.isEmpty()) {
            throw new IOException("Nenhum driver do cartao/token (PKCS#11) encontrado neste computador. Instale o"
                    + " driver do fabricante (ex.: SafeNet Authentication Client) ou o pacote opensc, ou informe o"
                    + " caminho em Pkcs11= no /etc/certimanager/terminal.conf.");
        }

        // O mesmo cartao pode aparecer pelo driver do fabricante e pelo OpenSC: guarda um so.
        Map<String, CertificadoInfo> certificados = new LinkedHashMap<>();
        for (String modulo : modulos) {
            for (String slot : slotsComToken(modulo)) {
                for (Map<String, String> objeto : objetosCertificado(modulo, slot)) {
                    X509Certificate x509 = lerCertificado(modulo, slot, objeto.get("ID"));
                    if (x509 == null || x509.getBasicConstraints() >= 0) {
                        continue; // cadeia da AC gravada no cartao, nao e o certificado do titular
                    }
                    String serie = x509.getSerialNumber().toString(16);
                    String subject = x509.getSubjectX500Principal().getName();
                    certificados.putIfAbsent(serie + "|" + subject, new CertificadoInfo(
                            objeto.getOrDefault("label", serie),
                            subject,
                            DateTimeFormatter.ISO_INSTANT.format(x509.getNotAfter().toInstant()),
                            serie));
                }
            }
        }
        return new ArrayList<>(certificados.values());
    }

    private static List<String> modulosDisponiveis(List<String> configurados) {
        Set<String> candidatos = new LinkedHashSet<>(configurados);
        candidatos.addAll(MODULOS_CONHECIDOS);
        List<String> existentes = new ArrayList<>();
        Set<Path> jaVistos = new LinkedHashSet<>();
        for (String candidato : candidatos) {
            Path caminho = Path.of(candidato);
            try {
                if (Files.isRegularFile(caminho) && jaVistos.add(caminho.toRealPath())) {
                    existentes.add(candidato);
                }
            } catch (IOException e) {
                // link quebrado: ignora
            }
        }
        return existentes;
    }

    private static List<String> slotsComToken(String modulo) throws IOException, InterruptedException {
        List<String> slots = new ArrayList<>();
        for (String linha : executar(modulo, "--list-token-slots").split("\\R")) {
            Matcher m = SLOT.matcher(linha);
            if (m.find()) {
                slots.add(m.group(1));
            }
        }
        return slots;
    }

    /** Blocos "Certificate Object" do pkcs11-tool -O, cada um com label, ID etc. */
    private static List<Map<String, String>> objetosCertificado(String modulo, String slot) throws IOException, InterruptedException {
        List<Map<String, String>> objetos = new ArrayList<>();
        Map<String, String> atual = null;
        for (String linha : executar(modulo, "--slot", slot, "--list-objects", "--type", "cert").split("\\R")) {
            if (linha.startsWith("Certificate Object")) {
                atual = new LinkedHashMap<>();
                objetos.add(atual);
            } else if (!linha.startsWith(" ") && !linha.startsWith("\t")) {
                atual = null;
            } else if (atual != null) {
                Matcher m = CAMPO.matcher(linha);
                if (m.matches()) {
                    atual.putIfAbsent(m.group(1).trim(), m.group(2).trim());
                }
            }
        }
        objetos.removeIf(o -> o.get("ID") == null || o.get("ID").isBlank());
        return objetos;
    }

    private static X509Certificate lerCertificado(String modulo, String slot, String id) throws IOException, InterruptedException {
        Path arquivo = Files.createTempFile("certimanager-", ".der");
        try {
            executar(modulo, "--slot", slot, "--read-object", "--type", "cert", "--id", id, "--output-file", arquivo.toString());
            byte[] der = Files.readAllBytes(arquivo);
            if (der.length == 0) {
                return null;
            }
            return (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(der));
        } catch (java.security.cert.CertificateException e) {
            return null;
        } finally {
            Files.deleteIfExists(arquivo);
        }
    }

    private static String executar(String modulo, String... argumentos) throws IOException, InterruptedException {
        List<String> comando = new ArrayList<>(List.of("pkcs11-tool", "--module", modulo));
        comando.addAll(List.of(argumentos));
        // A saida vai para um arquivo para o tempo limite valer mesmo se o driver travar
        Path saida = Files.createTempFile("certimanager-", ".txt");
        try {
            Process processo;
            try {
                processo = new ProcessBuilder(comando).redirectErrorStream(true)
                        .redirectOutput(saida.toFile()).start();
            } catch (IOException e) {
                throw new IOException("O pkcs11-tool nao esta instalado (pacote opensc).", e);
            }
            if (!processo.waitFor(TEMPO_LIMITE_SEGUNDOS, TimeUnit.SECONDS)) {
                processo.destroyForcibly();
                throw new IOException("O leitor do cartao nao respondeu (pkcs11-tool --module " + modulo + ").");
            }
            return Files.readString(saida, StandardCharsets.UTF_8);
        } finally {
            Files.deleteIfExists(saida);
        }
    }
}
