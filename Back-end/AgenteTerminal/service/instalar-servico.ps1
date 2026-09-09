#Requires -RunAsAdministrator
<#
    Instala o AgenteTerminal como Servico do Windows, usando o WinSW (winsw.github.io) como wrapper.
    Rode este script UMA VEZ em cada terminal que tenha leitora de cartao A3. Depois disso o agente:
      - inicia sozinho com o Windows (mesmo sem ninguem logado);
      - reinicia sozinho se cair;
      - se auto-atualiza sozinho a partir do ServidorLocal (nao precisa rodar este instalador de novo).

    Pre-requisitos nesta pasta antes de rodar:
      - AgenteTerminal.jar   (gerado por "mvn package" no modulo AgenteTerminal)
      - Java 21+ instalado e disponivel no PATH desta maquina
#>

param(
    [string]$WinSwVersion = "v3.0.0-alpha.11"
)

$ErrorActionPreference = "Stop"
$pastaScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$exeServico = Join-Path $pastaScript "AgenteTerminal.exe"
$jar = Join-Path $pastaScript "AgenteTerminal.jar"

if (-not (Test-Path $jar)) {
    Write-Error "AgenteTerminal.jar nao encontrado em '$pastaScript'. Copie o jar compilado para esta pasta antes de instalar o servico."
    exit 1
}

if (-not (Test-Path $exeServico)) {
    Write-Host "Baixando o WinSW (wrapper de servico Windows)..."
    $url = "https://github.com/winsw/winsw/releases/download/$WinSwVersion/WinSW-x64.exe"
    Invoke-WebRequest -Uri $url -OutFile $exeServico
}

Write-Host "Instalando o servico 'AgenteTerminal'..."
& $exeServico install
& $exeServico start

Write-Host ""
Write-Host "Pronto. O servico 'AgenteTerminal' esta instalado e rodando nesta maquina."
Write-Host "Ele vai iniciar sozinho com o Windows e se atualizar sozinho a partir de agora."
Write-Host "Para conferir: Get-Service AgenteTerminal"
