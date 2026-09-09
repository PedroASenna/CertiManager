#Requires -RunAsAdministrator
<#
    Remove o servico Windows do AgenteTerminal desta maquina.
#>

$ErrorActionPreference = "Stop"
$pastaScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$exeServico = Join-Path $pastaScript "AgenteTerminal.exe"

if (-not (Test-Path $exeServico)) {
    Write-Error "AgenteTerminal.exe nao encontrado em '$pastaScript'. O servico ja foi removido ou nunca foi instalado aqui."
    exit 1
}

& $exeServico stop
& $exeServico uninstall

Write-Host "Servico 'AgenteTerminal' removido desta maquina."
