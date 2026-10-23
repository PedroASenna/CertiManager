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
import io.javalin.util.JavalinBindException;

import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.net.BindException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
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

    private static final String URL_LOCAL = "http://localhost:" + PORTA;

    private static final Set<String> PREFIXOS_ROTAS_PUBLICAS = Set.of(
            "/api/login", "/api/cnpj/", "/api/agente/versao", "/api/status");

    /**
     * Sem argumentos o servidor sobe em segundo plano (e assim que ele roda na inicializacao do
     * sistema). Com --abrir-navegador, usado pelos atalhos da area de trabalho/menu, tambem abre o
     * sistema no navegador; se o servidor ja estiver rodando, so abre o navegador e sai.
     */
    public static void main(String[] args) {
        Configuracao config = Configuracao.carregar();
        redirecionarLogParaArquivo(config.arquivoLog());
        boolean abrirNavegador = Arrays.asList(args).contains("--abrir-navegador");

        if (certiManagerJaEstaRodando()) {
            System.out.println("O CertiManager ja esta rodando em " + URL_LOCAL + ".");
            if (abrirNavegador) {
                IconeBandeja.abrirNavegador(URL_LOCAL);
            }
            return;
        }

        try {
            iniciar(config, abrirNavegador);
        } catch (Exception e) {
            e.printStackTrace();
            IconeBandeja.mostrarErro(portaOcupada(e)
                    ? "A porta " + PORTA + " j\u00e1 est\u00e1 em uso por outro programa, ent\u00e3o o CertiManager n\u00e3o p\u00f4de iniciar.\n"
                            + "Se uma vers\u00e3o antiga do CertiManager (iniciar.bat / javaw) estiver aberta, encerre-a no\n"
                            + "Gerenciador de Tarefas e abra o CertiManager de novo."
                    : "N\u00e3o foi poss\u00edvel iniciar o servidor do CertiManager:\n" + e.getMessage()
                            + (config.arquivoLog() == null ? "" : "\n\nDetalhes em " + config.arquivoLog()));
            System.exit(1);
        }
    }

    private static void iniciar(Configuracao config, boolean abrirNavegador) throws IOException {
        Path pastaReleases = config.pastaReleases();
        Path pastaBackups = pastaGravavel(config.pastaBackups(), config.pastaBase().resolve("backups"));
        Path arquivoDb = config.arquivoBanco();
        Path pastaFrontend = config.pastaFrontend();

        Files.createDirectories(pastaReleases);
        Files.createDirectories(arquivoDb.toAbsolutePath().getParent());
        boolean primeiraExecucao = !Files.exists(arquivoDb);

        // Numa instalacao nova, o admin e o que foi digitado no instalador (config.ini).
        String login = config.loginAdminInicial();
        String senha = config.senhaAdminInicial();
        boolean adminDoInstalador = login != null && !login.isBlank() && senha != null && !senha.isBlank();

        Banco banco;
        try {
            banco = new Banco(arquivoDb.toString());
            Esquema.inicializar(banco,
                    adminDoInstalador ? login : Esquema.EMAIL_ADMIN_PADRAO,
                    adminDoInstalador ? senha : Esquema.SENHA_ADMIN_PADRAO);
        } catch (Exception e) {
            throw new IOException("Falha ao inicializar o banco de dados em " + arquivoDb, e);
        }
        config.removerSenhaDoConfigIni();

        Jwt jwt = new Jwt(ChaveSecreta.resolver(arquivoDb.resolveSibling("jwt-secret.key")));
        Auditoria auditoria = new Auditoria(banco);
        RoboEmail roboEmail = new RoboEmail(banco);

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

            routes.get("/api/status", ctx -> ctx.json(Map.of("aplicacao", "CertiManager", "status", "ok")));
            AutenticacaoRotas.registrar(routes, bancoFinal, jwt);
            CertificadosRotas.registrar(routes, bancoFinal, auditoria);
            UsuariosRotas.registrar(routes, bancoFinal, auditoria);
            LogsRotas.registrar(routes, bancoFinal);
            ImportacaoRotas.registrar(routes, bancoFinal, auditoria);
            ManutencaoRotas.registrar(routes, bancoFinal, auditoria, pastaBackups);
            CnpjRotas.registrar(routes);
            ConfigEmailRotas.registrar(routes, bancoFinal, roboEmail);
            AgenteRotas.registrar(routes, pastaReleases);
        });

        app.start(PORTA);
        roboEmail.iniciarAgendamento();

        System.out.println("ServidorLocal ouvindo em " + URL_LOCAL);
        System.out.println("Pasta de dados: " + config.pastaBase());
        System.out.println("Banco de dados: " + arquivoDb);
        System.out.println("Backups: " + pastaBackups);
        System.out.println("Pasta de releases do AgenteTerminal: " + pastaReleases);

        if (config.bandejaHabilitada()) {
            boolean comIcone = IconeBandeja.instalar(URL_LOCAL, config.pastaBase(), primeiraExecucao && !abrirNavegador, () -> {
                System.out.println("Servidor encerrado pelo icone da bandeja.");
                app.stop();
                System.exit(0);
            });
            if (!comIcone) {
                System.out.println("Bandeja do sistema indisponivel: o servidor segue rodando sem icone.");
            }
        }
        if (abrirNavegador) {
            IconeBandeja.abrirNavegador(URL_LOCAL);
        }
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

    /** Quem responde em /api/status com "CertiManager" e outra instancia deste servidor. */
    private static boolean certiManagerJaEstaRodando() {
        try {
            HttpClient cliente = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
            HttpResponse<String> resposta = cliente.send(
                    HttpRequest.newBuilder(URI.create(URL_LOCAL + "/api/status")).timeout(Duration.ofSeconds(3)).build(),
                    HttpResponse.BodyHandlers.ofString());
            return resposta.statusCode() == 200 && resposta.body().contains("CertiManager");
        } catch (IOException | RuntimeException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static boolean portaOcupada(Throwable erro) {
        for (Throwable causa = erro; causa != null; causa = causa.getCause()) {
            if (causa instanceof BindException || causa instanceof JavalinBindException) {
                return true;
            }
        }
        return false;
    }

    /** Sem console (instalado como aplicativo), a saida vai para um arquivo, girado aos 5 MB. */
    private static void redirecionarLogParaArquivo(Path arquivoLog) {
        if (arquivoLog == null) {
            return;
        }
        try {
            Files.createDirectories(arquivoLog.getParent());
            if (Files.exists(arquivoLog) && Files.size(arquivoLog) > 5L * 1024 * 1024) {
                Files.move(arquivoLog, arquivoLog.resolveSibling(arquivoLog.getFileName() + ".1"),
                        StandardCopyOption.REPLACE_EXISTING);
            }
            PrintStream saida = new PrintStream(new FileOutputStream(arquivoLog.toFile(), true), true, StandardCharsets.UTF_8);
            System.setOut(saida);
            System.setErr(saida);
            System.out.println();
            System.out.println("==== CertiManager iniciado em " + LocalDateTime.now().withNano(0) + " ====");
        } catch (IOException e) {
            System.err.println("Aviso: nao foi possivel gravar o log em " + arquivoLog + ": " + e.getMessage());
        }
    }

    /**
     * A pasta de backup escolhida no instalador pode estar num disco/pendrive que nao existe mais;
     * nesse caso o servidor sobe mesmo assim, usando a pasta padrao.
     */
    private static Path pastaGravavel(Path preferida, Path alternativa) throws IOException {
        try {
            return Files.createDirectories(preferida);
        } catch (IOException e) {
            System.err.println("Aviso: pasta de backup " + preferida + " indisponivel (" + e.getMessage()
                    + "). Usando " + alternativa + ".");
            return Files.createDirectories(alternativa);
        }
    }
}
