package com.certimanager.servidor.email;

import com.certimanager.servidor.db.Banco;
import jakarta.mail.Authenticator;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.PasswordAuthentication;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;

import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Roda uma vez por dia (a meia-noite) e avisa sobre certificados vencendo nos proximos 7 dias.
 * Modo EQUIPE: manda um resumo para os e-mails internos configurados. Modo CLIENTE: manda um
 * lembrete direto para o e-mail de cada cliente (email_cliente), quando cadastrado.
 */
public final class RoboEmail {

    private static final int DIAS_DE_ANTECEDENCIA = 7;

    private final Banco banco;

    public RoboEmail(Banco banco) {
        this.banco = banco;
    }

    public void iniciarAgendamento() {
        ScheduledExecutorService agendador = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "robo-email");
            t.setDaemon(true);
            return t;
        });

        long segundosAteMeiaNoite = segundosAteProximaMeiaNoite();
        agendador.scheduleAtFixedRate(this::executarComSeguranca, segundosAteMeiaNoite, TimeUnit.DAYS.toSeconds(1), TimeUnit.SECONDS);
    }

    private void executarComSeguranca() {
        try {
            executar();
        } catch (Exception e) {
            System.err.println("[RoboEmail] Falha ao executar rotina diaria: " + e.getMessage());
        }
    }

    private void executar() throws SQLException {
        Map<String, Object> config = banco.consultarUm("SELECT * FROM config_email WHERE id = 1");
        if (config == null || vazio(config.get("email_remetente")) || vazio(config.get("senha_app"))) {
            return; // robo ainda nao foi configurado em Configurar Robo de E-mail
        }

        List<Map<String, Object>> vencendo = banco.consultar(
                "SELECT * FROM certificados WHERE expiry_date <= date('now', '+" + DIAS_DE_ANTECEDENCIA + " days')");
        if (vencendo.isEmpty()) {
            return;
        }

        String modo = String.valueOf(config.get("modo_disparo"));
        try {
            if ("CLIENTE".equals(modo)) {
                for (Map<String, Object> cert : vencendo) {
                    String emailCliente = (String) cert.get("email_cliente");
                    if (!vazio(emailCliente)) {
                        enviarLembreteCliente(config, cert, emailCliente);
                    }
                }
            } else {
                enviarResumoEquipe(config, vencendo);
            }
        } catch (MessagingException e) {
            System.err.println("[RoboEmail] Falha ao enviar e-mail: " + e.getMessage());
        }
    }

    private void enviarResumoEquipe(Map<String, Object> config, List<Map<String, Object>> vencendo) throws MessagingException {
        String[] destinatarios = String.valueOf(config.get("email_equipe")).split(",");

        StringBuilder corpo = new StringBuilder();
        corpo.append("Existem ").append(vencendo.size())
                .append(" certificado(s) vencendo nos proximos ").append(DIAS_DE_ANTECEDENCIA).append(" dias ou ja vencidos:\n\n");
        for (Map<String, Object> cert : vencendo) {
            corpo.append("- ").append(cert.get("client_name"))
                    .append(" (").append(cert.get("doc_number")).append(") - vencimento: ")
                    .append(cert.get("expiry_date")).append('\n');
        }

        enviar(config, destinatarios, "ALERTA: Certificados Vencendo", corpo.toString());
    }

    private void enviarLembreteCliente(Map<String, Object> config, Map<String, Object> cert, String emailCliente) throws MessagingException {
        String nomeCliente = String.valueOf(cert.get("client_name"));
        String dataVencimento = String.valueOf(cert.get("expiry_date"));

        String corpo = "Ola, " + nomeCliente + "!\n\n"
                + "Seu certificado digital (" + cert.get("type") + ") vence em " + dataVencimento + ".\n"
                + "Entre em contato conosco para renovar e evitar problemas com o seu CNPJ/CPF.\n";

        enviar(config, new String[]{emailCliente}, "Seu certificado digital esta vencendo", corpo);
    }

    private void enviar(Map<String, Object> config, String[] destinatarios, String assunto, String corpo) throws MessagingException {
        String remetente = String.valueOf(config.get("email_remetente"));
        String senhaApp = String.valueOf(config.get("senha_app"));

        Properties propriedades = new Properties();
        propriedades.put("mail.smtp.auth", "true");
        propriedades.put("mail.smtp.starttls.enable", "true");
        propriedades.put("mail.smtp.host", "smtp.gmail.com");
        propriedades.put("mail.smtp.port", "587");

        Session sessao = Session.getInstance(propriedades, new Authenticator() {
            @Override
            protected PasswordAuthentication getPasswordAuthentication() {
                return new PasswordAuthentication(remetente, senhaApp);
            }
        });

        MimeMessage mensagem = new MimeMessage(sessao);
        mensagem.setFrom(new InternetAddress(remetente));
        for (String destinatario : destinatarios) {
            String destinatarioLimpo = destinatario.trim();
            if (!destinatarioLimpo.isEmpty()) {
                try {
                    mensagem.addRecipient(Message.RecipientType.TO, new InternetAddress(destinatarioLimpo));
                } catch (AddressException e) {
                    System.err.println("[RoboEmail] Endereco invalido ignorado: " + destinatarioLimpo);
                }
            }
        }
        mensagem.setSubject(assunto);
        mensagem.setText(corpo);

        Transport.send(mensagem);
    }

    private static boolean vazio(Object valor) {
        return valor == null || String.valueOf(valor).isBlank();
    }

    private static long segundosAteProximaMeiaNoite() {
        ZoneId zona = ZoneId.systemDefault();
        LocalDateTime agora = LocalDateTime.now(zona);
        LocalDateTime proximaMeiaNoite = LocalDate.now(zona).plusDays(1).atTime(LocalTime.MIDNIGHT);
        return java.time.Duration.between(agora, proximaMeiaNoite).getSeconds();
    }
}
