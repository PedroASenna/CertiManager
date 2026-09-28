#!/usr/bin/env bash
# Gera o pacote .deb do servidor CertiManager (com Java embutido, nao precisa instalar o Java).
#
# Uso (na raiz do repositorio):   ./instalador/linux/empacotar.sh 1.2.0
# Precisa de: JDK 21 (jpackage), Maven, Node/npm e dpkg-deb.
# Resultado: build/saida/certimanager_<versao>_amd64.deb
set -euo pipefail

VERSAO="${1:-1.0.0}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$RAIZ/build/linux"
SAIDA="$RAIZ/build/saida"
MODULOS="java.base,java.desktop,java.instrument,java.management,java.naming,java.net.http,java.rmi,java.security.jgss,java.security.sasl,java.sql,jdk.crypto.ec,jdk.charsets,jdk.localedata,jdk.unsupported"

rm -rf "$BUILD"
mkdir -p "$BUILD/entrada" "$SAIDA"

echo "==> Compilando o ServidorLocal"
mvn -q -f "$RAIZ/Back-end/ServidorLocal/pom.xml" package -DskipTests
cp "$RAIZ/Back-end/ServidorLocal/target/ServidorLocal.jar" "$BUILD/entrada/"

echo "==> Gerando o Front-end"
(cd "$RAIZ/Front-end/docs" && npm ci --no-audit --no-fund && npm run build)
cp -r "$RAIZ/Front-end/docs/dist" "$BUILD/entrada/frontend-dist"

echo "==> Montando o aplicativo com Java embutido (jpackage)"
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
    --java-options '-Dcertimanager.logEmArquivo=true' \
    --dest "$BUILD/imagem"

echo "==> Montando o .deb"
PACOTE="$BUILD/pacote"
mkdir -p "$PACOTE/DEBIAN" "$PACOTE/opt" \
    "$PACOTE/usr/share/applications" \
    "$PACOTE/etc/xdg/autostart" \
    "$PACOTE/usr/share/icons/hicolor/256x256/apps"
cp -a "$BUILD/imagem/CertiManager" "$PACOTE/opt/certimanager"
install -m 644 "$RAIZ/instalador/linux/certimanager.desktop" "$PACOTE/usr/share/applications/certimanager.desktop"
install -m 644 "$RAIZ/instalador/linux/certimanager-autostart.desktop" "$PACOTE/etc/xdg/autostart/certimanager.desktop"
install -m 644 "$RAIZ/instalador/icones/certimanager.png" "$PACOTE/usr/share/icons/hicolor/256x256/apps/certimanager.png"
install -m 755 "$RAIZ/instalador/linux/postinst" "$RAIZ/instalador/linux/prerm" "$RAIZ/instalador/linux/postrm" "$PACOTE/DEBIAN/"

TAMANHO_KB="$(du -sk "$PACOTE/opt" | cut -f1)"
cat > "$PACOTE/DEBIAN/control" <<EOF
Package: certimanager
Version: $VERSAO
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Pedro Sena & Kaio Rodrigues
Installed-Size: $TAMANHO_KB
Depends: libc6, zlib1g, libx11-6, libxext6, libxrender1, libxtst6, libxi6, libfreetype6, libfontconfig1, xdg-utils
Recommends: gnome-shell-extension-appindicator
Description: CertiManager - gestao de certificados digitais (servidor)
 Servidor local do CertiManager (porta 8888) com banco de dados, robo de
 e-mail e a interface web. Inicia junto com a sessao do usuario, em segundo
 plano, e fica acessivel pelo icone na bandeja do sistema.
EOF

dpkg-deb --root-owner-group --build "$PACOTE" "$SAIDA/certimanager_${VERSAO}_amd64.deb"
echo "==> Pronto: $SAIDA/certimanager_${VERSAO}_amd64.deb"
