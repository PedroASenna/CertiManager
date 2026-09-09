package com.certimanager.servidor;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Le a pasta de releases do AgenteTerminal (onde o administrador so precisa colocar o novo .jar)
 * e descobre sozinho qual e a versao mais recente publicada, sem precisar de um arquivo-ponteiro
 * mantido a mao.
 */
public final class RepositorioReleases {

    private static final Pattern NOME_ARQUIVO_RELEASE = Pattern.compile("AgenteTerminal-(\\d+\\.\\d+\\.\\d+)\\.jar");

    private final Path pasta;
    private final ConcurrentHashMap<Path, HashCache> cacheHash = new ConcurrentHashMap<>();

    private record HashCache(long tamanho, FileTime modificadoEm, String hashHex) {
    }

    public RepositorioReleases(Path pasta) {
        this.pasta = pasta;
    }

    public Optional<VersaoPublicada> versaoMaisRecente() throws IOException {
        try (Stream<Path> arquivos = Files.list(pasta)) {
            return arquivos
                    .filter(Files::isRegularFile)
                    .map(this::paraVersaoPublicadaOuNull)
                    .filter(v -> v != null)
                    .max(Comparator.comparing(VersaoPublicada::versao, RepositorioReleases::compararVersoes));
        }
    }

    private VersaoPublicada paraVersaoPublicadaOuNull(Path arquivo) {
        Matcher matcher = NOME_ARQUIVO_RELEASE.matcher(arquivo.getFileName().toString());
        return matcher.matches() ? new VersaoPublicada(matcher.group(1), arquivo) : null;
    }

    public String sha256De(Path arquivo) throws IOException, NoSuchAlgorithmException {
        long tamanho = Files.size(arquivo);
        FileTime modificadoEm = Files.getLastModifiedTime(arquivo);

        HashCache emCache = cacheHash.get(arquivo);
        if (emCache != null && emCache.tamanho() == tamanho && emCache.modificadoEm().equals(modificadoEm)) {
            return emCache.hashHex();
        }

        String hash = calcularSha256(arquivo);
        cacheHash.put(arquivo, new HashCache(tamanho, modificadoEm, hash));
        return hash;
    }

    private static String calcularSha256(Path arquivo) throws IOException, NoSuchAlgorithmException {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (var entrada = Files.newInputStream(arquivo)) {
            byte[] buffer = new byte[8192];
            int lidos;
            while ((lidos = entrada.read(buffer)) != -1) {
                digest.update(buffer, 0, lidos);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /** Compara versoes no formato "1.2.3" (numero de segmentos pode variar). */
    static int compararVersoes(String versaoA, String versaoB) {
        String[] a = versaoA.split("\\.");
        String[] b = versaoB.split("\\.");
        int tamanho = Math.max(a.length, b.length);
        for (int i = 0; i < tamanho; i++) {
            int valorA = i < a.length ? parseIntSeguro(a[i]) : 0;
            int valorB = i < b.length ? parseIntSeguro(b[i]) : 0;
            if (valorA != valorB) {
                return Integer.compare(valorA, valorB);
            }
        }
        return 0;
    }

    private static int parseIntSeguro(String valor) {
        try {
            return Integer.parseInt(valor.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
