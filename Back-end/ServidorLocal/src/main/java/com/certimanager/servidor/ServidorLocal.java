package com.certimanager.servidor;

import com.certimanager.servidor.auth.AuthContexto;
import com.certimanager.servidor.auth.ChaveSecreta;
import com.certimanager.servidor.auth.Jwt;
import com.certimanager.servidor.auth.Sessao;
import com.certimanager.servidor.db.Auditoria;
import com.certimanager.servidor.db.Banco;
import com.certimanager.servidor.db.Esquema;
import com.certimanager.servidor.email.RoboEmail;
import com.certimanager.servidor.rotas.AgenteRotas;
import com.certimanager.servidor.rotas.AutenticacaoRotas;
import com.certimanager.servidor.rotas.CertificadosRotas;
import com.certimanager.servidor.rotas.CnpjRotas;
import com.certimanager.servidor.rotas.ConfigEmailRotas;
import com.certimanager.servidor.rotas.ImportacaoRotas;
import com.certimanager.servidor.rotas.LogsRotas;
import com.certimanager.servidor.rotas.ManutencaoRotas;
import com.certimanager.servidor.rotas.UsuariosRotas;
import io.javalin.Javalin;
import io.javalin.config.RoutesConfig;
import io.javalin.http.BadRequestResponse;
import io.javalin.http.ForbiddenResponse;
import io.javalin.http.NotFoundResponse;
import io.javalin.http.UnauthorizedResponse;
import io.javalin.http.staticfiles.Location;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;

/**
 * Servidor central do CertiManager (porta 8888): banco SQLite, login, gestao de certificados e
 * usuarios, importacao em lote, backup/restore, robo diario de e-mail, proxy de CNPJ, distribuicao
 * de novas versoes do AgenteTerminal, e hospedagem dos arquivos estaticos do Front-end.
 *
 * O comportamento replica o protipo `Front-end/docs/server.ts` (Node/Express), que NAO e o backend
 * real deste projeto — serviu apenas como referencia do contrato de API que o front-end espera.
 */
public class ServidorLocal {

    public static final int PORTA = 8888;

    private static final Set<String> PREFIXOS_ROTAS_PUBLICAS = Set.of(
            "/api/login", "/api/cnpj/", "/api/agente/versao");

    public static void main(String[] args) throws IOException {
        Path pastaReleases = pastaDe("CERTIMANAGER_RELEASES_DIR", "releases");
        Path pastaBackups = pastaDe("CERTIMANAGER_BACKUPS_DIR", "backups");
        Path arquivoDb = Path.of(System.getenv().getOrDefault("CERTIMANAGER_DB_PATH", "database.sqlite"));
        Path pastaFrontend = pastaDe("CERTIMANAGER_FRONTEND_DIST_DIR", "frontend-dist");

        Files.createDirectories(pastaReleases);
        Files.createDirectories(pastaBackups);

        Banco banco;
        try {
            banco = new Banco(arquivoDb.toString());
            Esquema.inicializar(banco);
        } catch (Exception e) {
            throw new IOException("Falha ao inicializar o banco de dados em " + arquivoDb, e);
        }

        Jwt jwt = new Jwt(ChaveSecreta.resolver(arquivoDb.resolveSibling("jwt-secret.key")));
        Auditoria auditoria = new Auditoria(banco);

        Banco bancoFinal = banco;
        Javalin app = Javalin.create(cfg -> {
            if (Files.isDirectory(pastaFrontend)) {
                cfg.staticFiles.add(sf -> {
                    sf.directory = pastaFrontend.toAbsolutePath().toString();
                    sf.location = Location.EXTERNAL;
                });
            } else {
                System.out.println("Aviso: pasta do Front-end (" + pastaFrontend + ") nao encontrada."
                        + " Rode 'npm run build' no Front-end e copie o resultado para la, ou aponte"
                        + " CERTIMANAGER_FRONTEND_DIST_DIR. A API continua funcionando normalmente.");
            }

            RoutesConfig routes = cfg.routes;
            configurarCors(routes);
            configurarAutenticacao(routes, jwt);
            configurarTratamentoDeErros(routes);

            AutenticacaoRotas.registrar(routes, bancoFinal, jwt);
            CertificadosRotas.registrar(routes, bancoFinal, auditoria);
            UsuariosRotas.registrar(routes, bancoFinal, auditoria);
            LogsRotas.registrar(routes, bancoFinal);
            ImportacaoRotas.registrar(routes, bancoFinal, auditoria);
            ManutencaoRotas.registrar(routes, bancoFinal, auditoria, pastaBackups);
            CnpjRotas.registrar(routes);
            ConfigEmailRotas.registrar(routes, bancoFinal);
            AgenteRotas.registrar(routes, pastaReleases);
        });

        new RoboEmail(banco).iniciarAgendamento();

        app.start(PORTA);
        System.out.println("ServidorLocal ouvindo em http://localhost:" + PORTA);
        System.out.println("Banco de dados: " + arquivoDb.toAbsolutePath());
        System.out.println("Pasta de releases do AgenteTerminal: " + pastaReleases.toAbsolutePath());
    }

    private static void configurarCors(RoutesConfig routes) {
        routes.before(ctx -> ctx.header("Access-Control-Allow-Origin", "*"));
        routes.before(ctx -> ctx.header("Access-Control-Allow-Headers", "Content-Type, Authorization"));
        routes.before(ctx -> ctx.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"));
        routes.options("/*", ctx -> ctx.status(204));
    }

    private static void configurarAutenticacao(RoutesConfig routes, Jwt jwt) {
        routes.before("/api/*", ctx -> {
            if (ctx.method() == io.javalin.http.HandlerType.OPTIONS) {
                return; // preflight de CORS: o navegador nunca manda Authorization nele
            }

            boolean rotaPublica = PREFIXOS_ROTAS_PUBLICAS.stream().anyMatch(prefixo -> ctx.path().startsWith(prefixo));
            if (rotaPublica) {
                return;
            }

            String cabecalho = ctx.header("Authorization");
            String token = (cabecalho != null && cabecalho.startsWith("Bearer ")) ? cabecalho.substring(7) : null;
            if (token == null) {
                throw new UnauthorizedResponse("Unauthorized");
            }

            Sessao sessao = jwt.verificar(token).orElseThrow(() -> new UnauthorizedResponse("Invalid token"));
            AuthContexto.definir(ctx, sessao);
        });
    }

    private static void configurarTratamentoDeErros(RoutesConfig routes) {
        routes.exception(UnauthorizedResponse.class, (e, ctx) -> ctx.status(401).json(Map.of("error", e.getMessage())));
        routes.exception(ForbiddenResponse.class, (e, ctx) -> ctx.status(403).json(Map.of("error", e.getMessage())));
        routes.exception(BadRequestResponse.class, (e, ctx) -> ctx.status(400).json(Map.of("error", e.getMessage())));
        routes.exception(NotFoundResponse.class, (e, ctx) -> ctx.status(404).json(Map.of("error", "Nao encontrado")));
        routes.exception(Exception.class, (e, ctx) -> {
            e.printStackTrace();
            ctx.status(500).json(Map.of("error", String.valueOf(e.getMessage())));
        });
    }

    private static Path pastaDe(String variavelDeAmbiente, String padrao) {
        return Path.of(System.getenv().getOrDefault(variavelDeAmbiente, padrao)).toAbsolutePath().normalize();
    }
}
