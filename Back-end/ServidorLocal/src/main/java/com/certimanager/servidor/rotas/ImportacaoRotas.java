package com.certimanager.servidor.rotas;

import com.certimanager.servidor.auth.AuthContexto;
import com.certimanager.servidor.auth.Sessao;
import com.certimanager.servidor.db.Auditoria;
import com.certimanager.servidor.db.Banco;
import io.javalin.config.RoutesConfig;
import io.javalin.http.BadRequestResponse;
import io.javalin.http.UploadedFile;

import javax.naming.ldap.LdapName;
import javax.naming.ldap.Rdn;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Importacao em massa. "Importar de Pastas" (import-batch) le certificados A1 (.pfx/.p12) agrupados
 * por pasta, igual ao protipo Node original. "Importar CSV" (import-csv) e mais inteligente: le uma
 * planilha qualquer, procura e-mails nela e vincula cada um ao certificado cujo client_name (ou
 * doc_number) mais se parece com o resto da linha — nao cria certificados novos, so preenche
 * email_cliente nos que ja existem. Note que hoje o botao "Importar de Pastas" na tela ainda e um
 * texto fixo dizendo que depende de um "Crawler Java" futuro; ele nao chama este endpoint ainda.
 */
public final class ImportacaoRotas {

    private static final Pattern REGEX_SENHA_PREFIXO = Pattern.compile("^(?:senha)?[\\s=:\\-]*(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern REGEX_CPF_CNPJ = Pattern.compile("(?<!\\d)(\\d{11}|\\d{14})(?!\\d)");
    private static final Pattern REGEX_EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.-]+");

    private ImportacaoRotas() {
    }

    public static void registrar(RoutesConfig routes, Banco banco, Auditoria auditoria) {
        routes.post("/api/import-batch", ctx -> {
            Sessao sessao = AuthContexto.exigirRole(ctx, 2);
            List<UploadedFile> arquivos = ctx.uploadedFiles("files");

            Map<String, List<UploadedFile>> porPasta = new HashMap<>();
            for (UploadedFile arquivo : arquivos) {
                String nome = arquivo.filename();
                String pasta = nome.contains("/") ? nome.substring(0, nome.lastIndexOf('/')) : "";
                porPasta.computeIfAbsent(pasta, k -> new ArrayList<>()).add(arquivo);
            }

            int importados = 0;
            for (Map.Entry<String, List<UploadedFile>> entrada : porPasta.entrySet()) {
                String pasta = entrada.getKey();
                List<UploadedFile> arquivosDaPasta = entrada.getValue();

                UploadedFile pfx = arquivosDaPasta.stream()
                        .filter(f -> f.filename().endsWith(".pfx") || f.filename().endsWith(".p12"))
                        .findFirst().orElse(null);
                if (pfx == null) {
                    continue;
                }

                UploadedFile txt = arquivosDaPasta.stream().filter(f -> f.filename().endsWith(".txt")).findFirst().orElse(null);
                String senhaBruta;
                try {
                    senhaBruta = txt != null
                            ? new String(txt.content().readAllBytes(), StandardCharsets.UTF_8)
                            : nomeBase(pasta);
                } catch (IOException e) {
                    continue;
                }
                Matcher matcherSenha = REGEX_SENHA_PREFIXO.matcher(senhaBruta.trim());
                String senha = matcherSenha.matches() ? matcherSenha.group(1).trim() : senhaBruta.trim();

                try {
                    byte[] bytesPfx = pfx.content().readAllBytes();
                    KeyStore cofre = KeyStore.getInstance("PKCS12");
                    cofre.load(new ByteArrayInputStream(bytesPfx), senha.toCharArray());

                    var aliases = cofre.aliases();
                    while (aliases.hasMoreElements()) {
                        String alias = aliases.nextElement();
                        Certificate certificado = cofre.getCertificate(alias);
                        if (!(certificado instanceof X509Certificate x509)) {
                            continue;
                        }

                        String nomeComum = extrairNomeComum(x509);
                        String dataValidade = paraData(x509.getNotAfter());
                        String dataEmissao = paraData(x509.getNotBefore());

                        Matcher matcherDoc = REGEX_CPF_CNPJ.matcher(pfx.filename() + " " + pasta);
                        String docNumber = matcherDoc.find() ? matcherDoc.group(1) : "00000000000";

                        Map<String, Object> existente = banco.consultarUm(
                                "SELECT id FROM certificados WHERE client_name = ?", nomeComum);
                        if (existente == null) {
                            banco.executar("""
                                    INSERT INTO certificados (client_name, doc_number, expiry_date, issue_date, type, password)
                                    VALUES (?, ?, ?, ?, 'A1', ?)
                                    """, nomeComum, docNumber, dataValidade, dataEmissao, senha);
                            importados++;
                        }
                        break;
                    }
                } catch (Exception e) {
                    System.err.println("Erro ao processar " + pfx.filename() + ": " + e.getMessage());
                }
            }

            auditoria.registrar(sessao.email(), "Importacao em lote concluida (" + importados + " certificado(s))");
            ctx.json(Map.of("importedCount", importados));
        });

        routes.post("/api/import-csv", ctx -> {
            Sessao sessao = AuthContexto.exigirRole(ctx, 1);
            UploadedFile arquivo = ctx.uploadedFile("file");
            if (arquivo == null) {
                throw new BadRequestResponse("Nenhum arquivo enviado");
            }

            String conteudo;
            try {
                conteudo = new String(arquivo.content().readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                ctx.status(400).json(Map.of("error", "Nao foi possivel ler o arquivo enviado."));
                return;
            }

            List<Map<String, Object>> certificados = banco.consultar(
                    "SELECT id, client_name, doc_number FROM certificados");

            int emailsEncontrados = 0;
            int vinculados = 0;
            for (String linha : conteudo.split("\\r?\\n")) {
                Matcher matcherEmail = REGEX_EMAIL.matcher(linha);
                if (!matcherEmail.find()) {
                    continue;
                }
                emailsEncontrados++;
                String email = matcherEmail.group();
                String restoDaLinha = linha.replace(email, " ");

                Long idEncontrado = encontrarCertificadoCorrespondente(restoDaLinha, certificados);
                if (idEncontrado != null) {
                    banco.executar("UPDATE certificados SET email_cliente = ? WHERE id = ?", email, idEncontrado);
                    vinculados++;
                }
            }

            auditoria.registrar(sessao.email(),
                    "Importou CSV de e-mails (" + vinculados + " de " + emailsEncontrados + " vinculado(s))");
            ctx.json(Map.of(
                    "success", true,
                    "message", vinculados + " de " + emailsEncontrados + " e-mail(s) encontrado(s) foram vinculados a um cliente.",
                    "vinculados", vinculados,
                    "emailsEncontrados", emailsEncontrados
            ));
        });
    }

    private static Long encontrarCertificadoCorrespondente(String textoRestante, List<Map<String, Object>> certificados) {
        Matcher matcherDoc = REGEX_CPF_CNPJ.matcher(textoRestante);
        if (matcherDoc.find()) {
            String documento = matcherDoc.group(1);
            for (Map<String, Object> cert : certificados) {
                String docCert = String.valueOf(cert.get("doc_number")).replaceAll("\\D", "");
                if (!docCert.isEmpty() && docCert.equals(documento)) {
                    return ((Number) cert.get("id")).longValue();
                }
            }
        }

        String candidato = normalizar(textoRestante);
        if (candidato.length() < 3) {
            return null;
        }

        Long unicoEncontrado = null;
        for (Map<String, Object> cert : certificados) {
            String nomeCert = normalizar(String.valueOf(cert.get("client_name")));
            if (nomeCert.length() < 3) {
                continue;
            }
            if (candidato.contains(nomeCert) || nomeCert.contains(candidato)) {
                if (unicoEncontrado != null) {
                    return null; // ambiguo (bateu em mais de um cliente) -> nao arrisca vincular errado
                }
                unicoEncontrado = ((Number) cert.get("id")).longValue();
            }
        }
        return unicoEncontrado;
    }

    private static String normalizar(String texto) {
        String semAcentos = Normalizer.normalize(texto, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return semAcentos.toUpperCase().replaceAll("[^A-Z0-9 ]", " ").replaceAll("\\s+", " ").trim();
    }

    private static String extrairNomeComum(X509Certificate certificado) {
        try {
            LdapName nomeLdap = new LdapName(certificado.getSubjectX500Principal().getName());
            for (Rdn rdn : nomeLdap.getRdns()) {
                if ("CN".equalsIgnoreCase(rdn.getType())) {
                    return String.valueOf(rdn.getValue());
                }
            }
        } catch (Exception ignorado) {
            // segue com string vazia abaixo
        }
        return "";
    }

    private static String paraData(java.util.Date data) {
        LocalDate localDate = data.toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
        return localDate.toString();
    }

    private static String nomeBase(String caminho) {
        int barra = caminho.lastIndexOf('/');
        return barra >= 0 ? caminho.substring(barra + 1) : caminho;
    }
}
