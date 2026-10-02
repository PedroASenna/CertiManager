# Gera os instaladores do CertiManager para Windows (com Java embutido, nao precisa instalar o Java):
#   - Servidor: banco, robo de e-mail e o site (porta 8888), no computador principal;
#   - Terminal: leitor do cartao A3 (porta 8889) e atalho para o site, nos outros computadores.
#
# Uso (PowerShell, na raiz do repositorio):   .\instalador\windows\empacotar.ps1 -Versao 1.2.0
# Precisa de: JDK 21 (jpackage), Maven, Node/npm e Inno Setup 6.
# Resultado: build\saida\CertiManager-Servidor-Setup-<versao>.exe e CertiManager-Terminal-Setup-<versao>.exe
param(
    [string]$Versao = "1.0.0",
    [string]$Iscc = ""
)
$ErrorActionPreference = "Stop"

$raiz = (Resolve-Path "$PSScriptRoot\..\..").Path
$build = "$raiz\build\windows"
$saida = "$raiz\build\saida"
$modulosAgente = "java.base,java.logging,java.net.http,java.sql,jdk.charsets,jdk.crypto.ec,jdk.crypto.mscapi,jdk.httpserver,jdk.localedata,jdk.unsupported"
$modulos = "java.base,java.desktop,java.instrument,java.management,java.naming,java.net.http,java.rmi,java.security.jgss,java.security.sasl,java.sql,jdk.crypto.ec,jdk.charsets,jdk.localedata,jdk.unsupported"

function Executar([string]$descricao, [scriptblock]$comando) {
    Write-Host "==> $descricao"
    & $comando
    if ($LASTEXITCODE -ne 0) { throw "Falhou: $descricao (codigo $LASTEXITCODE)" }
}

if (Test-Path $build) { Remove-Item -Recurse -Force $build }
New-Item -ItemType Directory -Force "$build\entrada", "$build\agente", $saida | Out-Null

Executar "Compilando o ServidorLocal" { mvn -q -f "$raiz\Back-end\ServidorLocal\pom.xml" package -DskipTests }
Copy-Item "$raiz\Back-end\ServidorLocal\target\ServidorLocal.jar" "$build\entrada\"

# A versao do agente e a do instalador: e por ela que os terminais sabem que precisam se atualizar
Executar "Compilando o AgenteTerminal" { mvn -q -f "$raiz\Back-end\AgenteTerminal\pom.xml" package -DskipTests "-Dagente.versao=$Versao" }
Copy-Item "$raiz\Back-end\AgenteTerminal\target\AgenteTerminal.jar" "$build\agente\"

Push-Location "$raiz\Front-end\docs"
try {
    Executar "Instalando dependencias do Front-end" { npm ci --no-audit --no-fund }
    Executar "Gerando o Front-end" { npm run build }
} finally { Pop-Location }
Copy-Item -Recurse "$raiz\Front-end\docs\dist" "$build\entrada\frontend-dist"

# $ROOTDIR/$APPDIR sao expandidos pelo CertiManager.exe em tempo de execucao:
# $ROOTDIR = pasta de instalacao (C:\CertiManager), onde ficam banco, config.ini e logs.
Executar "Montando o Servidor com Java embutido (jpackage)" {
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

# $ROOTDIR = pasta de instalacao do terminal (C:\CertiManager-Terminal): config.ini e logs\agente.log
Executar "Montando o AgenteTerminal com Java embutido (jpackage)" {
    jpackage --type app-image `
        --name AgenteTerminal `
        --app-version $Versao `
        --vendor "Pedro Sena & Kaio Rodrigues" `
        --description "Leitor de cartao A3 do CertiManager" `
        --icon "$raiz\instalador\icones\certimanager.ico" `
        --input "$build\agente" `
        --main-jar AgenteTerminal.jar `
        --main-class com.certimanager.agente.AgenteTerminal `
        --add-modules $modulosAgente `
        --java-options '-Dcertimanager.config=$ROOTDIR\config.ini' `
        --java-options '-Dcertimanager.log=$ROOTDIR\logs\agente.log' `
        --dest "$build\imagem-terminal"
}

if (-not $Iscc) {
    $Iscc = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Iscc) { throw "ISCC.exe (Inno Setup 6) nao encontrado. Instale o Inno Setup ou passe -Iscc <caminho>." }

Executar "Gerando o instalador do Servidor (Inno Setup)" {
    & $Iscc "/DVersao=$Versao" "/DPastaImagem=$build\imagem\CertiManager" "/DJarAgente=$build\agente\AgenteTerminal.jar" "/O$saida" "$PSScriptRoot\CertiManager-Servidor.iss"
}
Executar "Gerando o instalador do Terminal (Inno Setup)" {
    & $Iscc "/DVersao=$Versao" "/DPastaImagem=$build\imagem-terminal\AgenteTerminal" "/O$saida" "$PSScriptRoot\CertiManager-Terminal.iss"
}
Write-Host "==> Pronto: $saida\CertiManager-Servidor-Setup-$Versao.exe"
Write-Host "==> Pronto: $saida\CertiManager-Terminal-Setup-$Versao.exe"
