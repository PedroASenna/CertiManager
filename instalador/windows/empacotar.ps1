# Gera o instalador do CertiManager para Windows (com Java embutido, nao precisa instalar o Java).
#
# Uso (PowerShell, na raiz do repositorio):   .\instalador\windows\empacotar.ps1 -Versao 1.2.0
# Precisa de: JDK 21 (jpackage), Maven, Node/npm e Inno Setup 6.
# Resultado: build\saida\CertiManager-Setup-<versao>.exe
param(
    [string]$Versao = "1.0.0",
    [string]$Iscc = ""
)
$ErrorActionPreference = "Stop"

$raiz = (Resolve-Path "$PSScriptRoot\..\..").Path
$build = "$raiz\build\windows"
$saida = "$raiz\build\saida"
$modulos = "java.base,java.desktop,java.instrument,java.management,java.naming,java.net.http,java.rmi,java.security.jgss,java.security.sasl,java.sql,jdk.crypto.ec,jdk.charsets,jdk.localedata,jdk.unsupported"

function Executar([string]$descricao, [scriptblock]$comando) {
    Write-Host "==> $descricao"
    & $comando
    if ($LASTEXITCODE -ne 0) { throw "Falhou: $descricao (codigo $LASTEXITCODE)" }
}

if (Test-Path $build) { Remove-Item -Recurse -Force $build }
New-Item -ItemType Directory -Force "$build\entrada", $saida | Out-Null

Executar "Compilando o ServidorLocal" { mvn -q -f "$raiz\Back-end\ServidorLocal\pom.xml" package -DskipTests }
Copy-Item "$raiz\Back-end\ServidorLocal\target\ServidorLocal.jar" "$build\entrada\"

Push-Location "$raiz\Front-end\docs"
try {
    Executar "Instalando dependencias do Front-end" { npm ci --no-audit --no-fund }
    Executar "Gerando o Front-end" { npm run build }
} finally { Pop-Location }
Copy-Item -Recurse "$raiz\Front-end\docs\dist" "$build\entrada\frontend-dist"

# $ROOTDIR/$APPDIR sao expandidos pelo CertiManager.exe em tempo de execucao:
# $ROOTDIR = pasta de instalacao (C:\CertiManager), onde ficam banco, config.ini e logs.
Executar "Montando o aplicativo com Java embutido (jpackage)" {
    jpackage --type app-image `
        --name CertiManager `
        --app-version $Versao `
        --vendor "Pedro Sena & Kaio Rodrigues" `
        --description "Servidor do CertiManager" `
        --icon "$raiz\instalador\icones\certimanager.ico" `
        --input "$build\entrada" `
        --main-jar ServidorLocal.jar `
        --main-class com.certimanager.servidor.ServidorLocal `
        --add-modules $modulos `
        --java-options '-Dcertimanager.home=$ROOTDIR' `
        --java-options '-Dcertimanager.frontend=$APPDIR\frontend-dist' `
        --java-options '-Dcertimanager.logEmArquivo=true' `
        --dest "$build\imagem"
}

if (-not $Iscc) {
    $Iscc = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Iscc) { throw "ISCC.exe (Inno Setup 6) nao encontrado. Instale o Inno Setup ou passe -Iscc <caminho>." }

Executar "Gerando o instalador (Inno Setup)" {
    & $Iscc "/DVersao=$Versao" "/DPastaImagem=$build\imagem\CertiManager" "/O$saida" "$PSScriptRoot\CertiManager.iss"
}
Write-Host "==> Pronto: $saida\CertiManager-Setup-$Versao.exe"
