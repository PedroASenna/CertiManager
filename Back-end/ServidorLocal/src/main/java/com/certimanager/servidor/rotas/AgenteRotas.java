package com.certimanager.servidor.rotas;

import com.certimanager.servidor.RepositorioReleases;
import com.certimanager.servidor.VersaoPublicada;
import io.javalin.config.RoutesConfig;
import io.javalin.http.NotFoundResponse;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Distribuicao de novas versoes do AgenteTerminal: o que os terminais consultam para se
 * auto-atualizar sozinhos (ver Back-end/AgenteTerminal/AutoUpdater.java).
 */
public final class AgenteRotas {

    private static final Pattern NOME_ARQUIVO_VALIDO = Pattern.compile("AgenteTerminal-\\d+\\.\\d+\\.\\d+\\.jar");

    private AgenteRotas() {
    }

    public static void registrar(RoutesConfig routes, Path pastaReleases) {
        RepositorioReleases repositorio = new RepositorioReleases(pastaReleases);

        routes.get("/api/agente/versao", ctx -> {
            Optional<VersaoPublicada> versao = repositorio.versaoMaisRecente();
            if (versao.isEmpty()) {
                ctx.status(404).json(Map.of("erro", "Nenhuma versao do AgenteTerminal publicada ainda em releases/."));
                return;
            }

            VersaoPublicada publicada = versao.get();
            String hash = repositorio.sha256De(publicada.arquivo());
            String host = ctx.host() != null ? ctx.host() : "localhost:8888";
            String url = ctx.scheme() + "://" + host + "/downloads/" + publicada.arquivo().getFileName();

            ctx.json(Map.of("versao", publicada.versao(), "url", url, "sha256", hash));
        });

        routes.get("/downloads/{arquivo}", ctx -> {
            String nomeArquivo = ctx.pathParam("arquivo");
            if (!NOME_ARQUIVO_VALIDO.matcher(nomeArquivo).matches()) {
                ctx.status(400).result("Nome de arquivo invalido");
                return;
            }

            Path arquivo = pastaReleases.resolve(nomeArquivo).normalize();
            if (!arquivo.startsWith(pastaReleases) || !Files.isRegularFile(arquivo)) {
                throw new NotFoundResponse();
            }

            ctx.contentType("application/java-archive");
            ctx.result(Files.newInputStream(arquivo));
        });
    }
}
