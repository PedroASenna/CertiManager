package com.certimanager.servidor;

import javax.imageio.ImageIO;
import javax.swing.JOptionPane;
import java.awt.AWTException;
import java.awt.Desktop;
import java.awt.GraphicsEnvironment;
import java.awt.Image;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Icone do servidor na bandeja do sistema (area de notificacao do Windows / indicador do Linux).
 * O servidor roda sem janela; o icone e a unica parte visivel e da acesso rapido ao sistema.
 */
public final class IconeBandeja {

    private IconeBandeja() {
    }

    /** Suporte a bandeja: no Windows sempre existe; no GNOME depende da extensao AppIndicator. */
    public static boolean disponivel() {
        return !GraphicsEnvironment.isHeadless() && SystemTray.isSupported();
    }

    /**
     * Mostra o icone. Retorna false (sem erro) quando nao ha bandeja disponivel, por exemplo num
     * servidor Linux sem interface grafica, e o servidor segue rodando normalmente.
     */
    public static boolean instalar(String urlSistema, Path pastaDados, boolean avisarQueEstaRodando, Runnable encerrar) {
        if (!disponivel()) {
            return false;
        }
        try {
            SystemTray bandeja = SystemTray.getSystemTray();

            PopupMenu menu = new PopupMenu();
            MenuItem abrir = new MenuItem("Abrir CertiManager");
            abrir.addActionListener(e -> abrirNavegador(urlSistema));
            MenuItem pasta = new MenuItem("Abrir pasta de dados");
            pasta.addActionListener(e -> abrirPasta(pastaDados));
            MenuItem sair = new MenuItem("Encerrar servidor");
            sair.addActionListener(e -> confirmarEncerramento(encerrar));
            menu.add(abrir);
            menu.add(pasta);
            menu.addSeparator();
            menu.add(sair);

            TrayIcon icone = new TrayIcon(carregarImagem(bandeja), "CertiManager - servidor ativo (" + urlSistema + ")", menu);
            icone.setImageAutoSize(true);
            icone.addActionListener(e -> abrirNavegador(urlSistema)); // clique duplo no Windows
            bandeja.add(icone);

            if (avisarQueEstaRodando) {
                icone.displayMessage("CertiManager",
                        "O servidor está rodando em segundo plano. Use este ícone para abrir o sistema.",
                        TrayIcon.MessageType.INFO);
            }
            return true;
        } catch (AWTException | IOException | RuntimeException e) {
            System.err.println("Aviso: nao foi possivel mostrar o icone na bandeja: " + e.getMessage());
            return false;
        }
    }

    public static void abrirNavegador(String url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(url));
            } else {
                abrirComSistema(url);
            }
        } catch (IOException | RuntimeException e) {
            System.err.println("Aviso: nao foi possivel abrir o navegador: " + e.getMessage());
        }
    }

    public static void mostrarErro(String mensagem) {
        System.err.println(mensagem);
        if (!GraphicsEnvironment.isHeadless()) {
            JOptionPane.showMessageDialog(null, mensagem, "CertiManager", JOptionPane.ERROR_MESSAGE);
        }
    }

    private static void abrirPasta(Path pasta) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
                Desktop.getDesktop().open(pasta.toFile());
            } else {
                abrirComSistema(pasta.toString());
            }
        } catch (IOException | RuntimeException e) {
            System.err.println("Aviso: nao foi possivel abrir a pasta " + pasta + ": " + e.getMessage());
        }
    }

    // Desktop.browse/open nem sempre funciona fora do GNOME (ex.: XFCE, KDE sem libgnome).
    private static void abrirComSistema(String alvo) throws IOException {
        String so = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (so.contains("win")) {
            new ProcessBuilder("explorer", alvo).start();
        } else {
            new ProcessBuilder("xdg-open", alvo).start();
        }
    }

    private static void confirmarEncerramento(Runnable encerrar) {
        int resposta = JOptionPane.showConfirmDialog(null,
                "Encerrar o servidor do CertiManager?\n"
                        + "Os computadores da rede perdem o acesso até ele ser iniciado de novo\n"
                        + "(pelo atalho CertiManager ou reiniciando o computador).",
                "CertiManager", JOptionPane.YES_NO_OPTION, JOptionPane.WARNING_MESSAGE);
        if (resposta == JOptionPane.YES_OPTION) {
            encerrar.run();
        }
    }

    private static Image carregarImagem(SystemTray bandeja) throws IOException {
        try (InputStream in = IconeBandeja.class.getResourceAsStream("/icone-bandeja.png")) {
            if (in == null) {
                throw new IOException("icone-bandeja.png nao encontrado no jar");
            }
            BufferedImage original = ImageIO.read(in);
            int largura = bandeja.getTrayIconSize().width;
            int altura = bandeja.getTrayIconSize().height;
            return original.getScaledInstance(largura, altura, Image.SCALE_SMOOTH);
        }
    }
}
