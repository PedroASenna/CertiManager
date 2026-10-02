#!/usr/bin/env bash
# Gera os pacotes .deb do CertiManager (com Java embutido, nao precisa instalar o Java):
#   - certimanager-servidor: banco, robo de e-mail e o site (porta 8888), no computador principal;
#   - certimanager-terminal: leitor do cartao A3 (porta 8889) e atalho para o site, nos outros computadores.
#
# Uso (na raiz do repositorio):   ./instalador/linux/empacotar.sh 1.2.0
# Precisa de: JDK 21 (jpackage), Maven, Node/npm e dpkg-deb.
# Resultado: build/saida/certimanager-servidor_<versao>_amd64.deb e certimanager-terminal_<versao>_amd64.deb
set -euo pipefail

VERSAO="${1:-1.0.0}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
LINUX="$RAIZ/instalador/linux"
BUILD="$RAIZ/build/linux"
SAIDA="$RAIZ/build/saida"
MODULOS="java.base,java.desktop,java.instrument,java.management,java.naming,java.net.http,java.rmi,java.security.jgss,java.security.sasl,java.sql,jdk.crypto.ec,jdk.charsets,jdk.localedata,jdk.unsupported"
MODULOS_AGENTE="java.base,java.logging,java.net.http,java.sql,jdk.charsets,jdk.crypto.ec,jdk.httpserver,jdk.localedata,jdk.unsupported"

rm -rf "$BUILD"
mkdir -p "$BUILD/entrada" "$BUILD/agente" "$SAIDA"

echo "==> Compilando o ServidorLocal"
mvn -q -f "$RAIZ/Back-end/ServidorLocal/pom.xml" package -DskipTests
cp "$RAIZ/Back-end/ServidorLocal/target/ServidorLocal.jar" "$BUILD/entrada/"

# A versao do agente e a do pacote: e por ela que os terminais Windows sabem que precisam se atualizar
echo "==> Compilando o AgenteTerminal"
mvn -q -f "$RAIZ/Back-end/AgenteTerminal/pom.xml" package -DskipTests "-Dagente.versao=$VERSAO"
cp "$RAIZ/Back-end/AgenteTerminal/target/AgenteTerminal.jar" "$BUILD/agente/"

echo "==> Gerando o Front-end"
(cd "$RAIZ/Front-end/docs" && npm ci --no-audit --no-fund && npm run build)
cp -r "$RAIZ/Front-end/docs/dist" "$BUILD/entrada/frontend-dist"

# O servidor distribui o agente aos terminais (GET /api/agente/versao), a partir de releases/
mkdir -p "$BUILD/entrada/releases"
cp "$BUILD/agente/AgenteTerminal.jar" "$BUILD/entrada/releases/AgenteTerminal-$VERSAO.jar"

echo "==> Montando o Servidor com Java embutido (jpackage)"
# $APPDIR e expandido pelo lancador em tempo de execucao (/opt/certimanager/lib/app).
# Os dados ficam na pasta de cada usuario, porque o servidor roda na sessao dele (bandeja).
jpackage --type app-image \
    --name CertiManager \
    --app-version "$VERSAO" \
    --vendor "Pedro Sena & Kaio Rodrigues" \
    --description "Servidor do CertiManager" \
    --icon "$RAIZ/instalador/icones/certimanager.png" \
    --input "$BUILD/entrada" \
    --main-jar ServidorLocal.jar \
    --main-class com.certimanager.servidor.ServidorLocal \
    --add-modules "$MODULOS" \
    --java-options '-Dcertimanager.home=~/.local/share/certimanager' \
    --java-options '-Dcertimanager.frontend=$APPDIR/frontend-dist' \
    --java-options '-Dcertimanager.releases=$APPDIR/releases' \
    --java-options '-Dcertimanager.logEmArquivo=true' \
    --dest "$BUILD/imagem"

echo "==> Montando o AgenteTerminal com Java embutido (jpackage)"
jpackage --type app-image \
    --name AgenteTerminal \
    --app-version "$VERSAO" \
    --vendor "Pedro Sena & Kaio Rodrigues" \
    --description "Leitor de cartao A3 do CertiManager" \
    --icon "$RAIZ/instalador/icones/certimanager.png" \
    --input "$BUILD/agente" \
    --main-jar AgenteTerminal.jar \
    --main-class com.certimanager.agente.AgenteTerminal \
    --add-modules "$MODULOS_AGENTE" \
    --java-options '-Dcertimanager.config=/etc/certimanager/terminal.conf' \
    --java-options '-Dcertimanager.log=~/.local/state/certimanager-terminal/agente.log' \
    --dest "$BUILD/imagem-terminal"

# Uso: gerar_control <pasta do pacote> <nome> <depends> <campos extras> <descricao>
gerar_control() {
    local pacote="$1" nome="$2" depends="$3" extras="$4" descricao="$5"
    local tamanho_kb
    tamanho_kb="$(du -sk "$pacote" --exclude=DEBIAN | cut -f1)"
    {
        echo "Package: $nome"
        echo "Version: $VERSAO"
        echo "Section: utils"
        echo "Priority: optional"
        echo "Architecture: amd64"
        echo "Maintainer: Pedro Sena & Kaio Rodrigues"
        echo "Installed-Size: $tamanho_kb"
        echo "Depends: $depends"
        [ -z "$extras" ] || printf '%s\n' "$extras"
        printf '%s\n' "$descricao"
    } > "$pacote/DEBIAN/control"
}

echo "==> Montando o certimanager-servidor .deb"
PACOTE="$BUILD/pacote-servidor"
mkdir -p "$PACOTE/DEBIAN" "$PACOTE/opt" \
    "$PACOTE/usr/share/applications" \
    "$PACOTE/etc/xdg/autostart" \
    "$PACOTE/usr/share/icons/hicolor/256x256/apps"
cp -a "$BUILD/imagem/CertiManager" "$PACOTE/opt/certimanager"
install -m 644 "$LINUX/servidor/certimanager.desktop" "$PACOTE/usr/share/applications/certimanager.desktop"
install -m 644 "$LINUX/servidor/certimanager-autostart.desktop" "$PACOTE/etc/xdg/autostart/certimanager.desktop"
install -m 644 "$RAIZ/instalador/icones/certimanager.png" "$PACOTE/usr/share/icons/hicolor/256x256/apps/certimanager.png"
install -m 755 "$LINUX/servidor/postinst" "$LINUX/servidor/prerm" "$LINUX/servidor/postrm" "$PACOTE/DEBIAN/"
# "certimanager" era o nome do pacote antes da separacao em servidor/terminal: o apt troca um pelo outro
gerar_control "$PACOTE" certimanager-servidor \
    "libc6, zlib1g, libx11-6, libxext6, libxrender1, libxtst6, libxi6, libfreetype6, libfontconfig1, xdg-utils" \
    "Suggests: gnome-shell-extension-appindicator
Provides: certimanager
Conflicts: certimanager
Replaces: certimanager" \
    "Description: CertiManager - gestao de certificados digitais (servidor)
 Servidor local do CertiManager (porta 8888) com banco de dados, robo de
 e-mail e a interface web. Inicia junto com a sessao do usuario, em segundo
 plano, e fica acessivel pelo icone na bandeja do sistema."
dpkg-deb --root-owner-group --build "$PACOTE" "$SAIDA/certimanager-servidor_${VERSAO}_amd64.deb"

echo "==> Montando o certimanager-terminal .deb"
PACOTE="$BUILD/pacote-terminal"
mkdir -p "$PACOTE/DEBIAN" "$PACOTE/opt" "$PACOTE/usr/bin" \
    "$PACOTE/usr/share/applications" \
    "$PACOTE/etc/xdg/autostart" \
    "$PACOTE/usr/share/icons/hicolor/256x256/apps"
cp -a "$BUILD/imagem-terminal/AgenteTerminal" "$PACOTE/opt/certimanager-terminal"
install -m 755 "$LINUX/terminal/certimanager-terminal" "$PACOTE/usr/bin/certimanager-terminal"
install -m 644 "$LINUX/terminal/certimanager-terminal.desktop" "$PACOTE/usr/share/applications/certimanager-terminal.desktop"
install -m 644 "$LINUX/terminal/certimanager-terminal-agente.desktop" "$PACOTE/etc/xdg/autostart/certimanager-terminal-agente.desktop"
# Nome proprio do icone: servidor e terminal podem ser instalados no mesmo computador
install -m 644 "$RAIZ/instalador/icones/certimanager.png" "$PACOTE/usr/share/icons/hicolor/256x256/apps/certimanager-terminal.png"
install -m 755 "$LINUX/terminal/config" "$LINUX/terminal/postinst" "$LINUX/terminal/prerm" "$LINUX/terminal/postrm" "$PACOTE/DEBIAN/"
install -m 644 "$LINUX/terminal/templates" "$PACOTE/DEBIAN/templates"
# pcscd conversa com o leitor USB; opensc traz o pkcs11-tool e o driver generico dos cartoes
gerar_control "$PACOTE" certimanager-terminal \
    "libc6, zlib1g, debconf (>= 0.5) | debconf-2.0, opensc, pcscd, xdg-utils" \
    "" \
    "Description: CertiManager - gestao de certificados digitais (terminal)
 Para os computadores que usam o CertiManager instalado em outra maquina.
 Le o cartao/token A3 espetado neste computador para o botao \"Ler do
 Computador\" (porta 8889, so para este computador) e cria o atalho para o
 site do servidor."
dpkg-deb --root-owner-group --build "$PACOTE" "$SAIDA/certimanager-terminal_${VERSAO}_amd64.deb"

echo "==> Pronto: $SAIDA/certimanager-servidor_${VERSAO}_amd64.deb"
echo "==> Pronto: $SAIDA/certimanager-terminal_${VERSAO}_amd64.deb"
