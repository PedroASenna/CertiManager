; Instalador do CertiManager TERMINAL para Windows (Inno Setup 6).
;
; Nao compile este arquivo sozinho: rode instalador\windows\empacotar.ps1, que gera antes o
; AgenteTerminal com Java embutido (jpackage) e depois chama o compilador do Inno Setup.
;
; Para os computadores que USAM o sistema (recepcao, fiscal...). Instala o AgenteTerminal.exe,
; que roda sem janela na sessao do usuario e le o cartao/token A3 espetado neste computador para
; o botao "Ler do Computador" do site (http://localhost:8889), e cria o atalho para o site do
; servidor. O agente se atualiza sozinho a partir do servidor.

#ifndef Versao
  #define Versao "1.0.0"
#endif
#ifndef PastaImagem
  #define PastaImagem "..\..\build\windows\imagem-terminal\AgenteTerminal"
#endif

[Setup]
AppId=CertiManagerTerminal
AppName=CertiManager Terminal
AppVersion={#Versao}
AppVerName=CertiManager Terminal {#Versao}
AppPublisher=Pedro Sena & Kaio Rodrigues

; Arquivo de texto obrigatório com a apresentação comercial e termos legais
LicenseFile=Termos.txt

; Fora de "Arquivos de Programas" porque o agente se atualiza sozinho, sem pedir administrador
DefaultDirName=C:\CertiManager-Terminal
DisableProgramGroupPage=yes
OutputBaseFilename=CertiManager-Terminal-Setup-{#Versao}
SetupIconFile=..\icones\certimanager.ico
UninstallDisplayIcon={app}\certimanager.ico
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
WizardStyle=modern

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "Atalhos do Sistema:"; Flags: checkedonce

[Dirs]
; O agente roda na sessão do usuário, grava o log aqui e troca o próprio .jar ao se atualizar
Name: "{app}"; Permissions: users-modify

[InstallDelete]
; Arquivos do próprio aplicativo, trocados inteiros a cada versão
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\runtime"

[Files]
; AgenteTerminal com Java embutido gerado pelo jpackage: AgenteTerminal.exe, app\ e runtime\
Source: "{#PastaImagem}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\icones\certimanager.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "Termos.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Atalho de internet direto para o site do servidor
Name: "{autodesktop}\CertiManager"; Filename: "{code:UrlDoServidor}"; IconFilename: "{app}\certimanager.ico"; Tasks: desktopicon
Name: "{autoprograms}\CertiManager"; Filename: "{code:UrlDoServidor}"; IconFilename: "{app}\certimanager.ico"
; O agente precisa rodar na sessão de quem está usando o computador: é ali que o Windows publica o
; certificado do cartão. Se dois usuários entrarem, o segundo percebe que a porta já está em uso e sai.
Name: "{commonstartup}\CertiManager - Leitor de Cartao A3"; Filename: "{app}\AgenteTerminal.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\AgenteTerminal.exe"; WorkingDir: "{app}"; Flags: nowait runasoriginaluser; StatusMsg: "Iniciando o leitor de cartão A3..."
Filename: "{code:UrlDoServidor}"; Description: "Acessar o CertiManager agora"; Flags: shellexec nowait postinstall skipifsilent runasoriginaluser

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM AgenteTerminal.exe"; Flags: runhidden; RunOnceId: "PararAgente"

[Code]
var
  PageIP: TInputQueryWizardPage;

{ Lê uma chave do config.ini de uma instalação anterior (formato chave=valor, sem seções) }
function LerConfigExistente(Chave: String): String;
var
  Linhas: TArrayOfString;
  I: Integer;
begin
  Result := '';
  if LoadStringsFromFile(AddBackslash(WizardDirValue) + 'config.ini', Linhas) then
    for I := 0 to GetArrayLength(Linhas) - 1 do
      if Pos(Lowercase(Chave) + '=', Lowercase(Trim(Linhas[I]))) = 1 then
        Result := Trim(Copy(Trim(Linhas[I]), Length(Chave) + 2, MaxInt));
end;

procedure InitializeWizard;
begin
  PageIP := CreateInputQueryPage(wpSelectDir,
    'Configuração do Terminal',
    'Conexão com o Servidor',
    'Informe o endereço IP do computador onde o CertiManager Servidor está instalado (exemplo: 192.168.1.50).');
  PageIP.Add('Endereço IP do Servidor:', False);
  { Instalação silenciosa: CertiManager-Terminal-Setup.exe /VERYSILENT /SERVIDOR=192.168.1.50 }
  PageIP.Values[0] := ExpandConstant('{param:SERVIDOR|}');
end;

function UrlDoServidor(Param: String): String;
var
  Endereco: String;
begin
  Endereco := Trim(PageIP.Values[0]);
  if Pos('://', Endereco) > 0 then
    Delete(Endereco, 1, Pos('://', Endereco) + 2);
  while (Length(Endereco) > 0) and (Endereco[Length(Endereco)] = '/') do
    Delete(Endereco, Length(Endereco), 1);
  if Endereco = '' then
    Endereco := 'localhost';
  if Pos(':', Endereco) = 0 then
    Endereco := Endereco + ':8888';
  Result := 'http://' + Endereco;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  { Atualização: já sugere o servidor que estava configurado }
  if (CurPageID = PageIP.ID) and (Trim(PageIP.Values[0]) = '') then
    PageIP.Values[0] := LerConfigExistente('Servidor');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = PageIP.ID) and (Trim(PageIP.Values[0]) = '') then begin
    MsgBox('Você precisa informar o endereço IP do Servidor para continuar.', mbError, MB_OK);
    Result := False;
  end;
end;

{ Para o agente que estiver rodando, senão os arquivos dele ficam travados }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
begin
  Result := '';
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM AgenteTerminal.exe', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  { Versão antiga: o agente instalado como serviço do Windows (instalar-servico.ps1, WinSW). O serviço
    roda como SYSTEM, que não enxerga o certificado do cartão do usuário, e ocupa a porta 8889. }
  Exec(ExpandConstant('{sys}\sc.exe'), 'stop AgenteTerminal', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Exec(ExpandConstant('{sys}\sc.exe'), 'delete AgenteTerminal', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Config: TArrayOfString;
begin
  if CurStep = ssPostInstall then begin
    SetArrayLength(Config, 2);
    Config[0] := 'Modo=TERMINAL';
    Config[1] := 'Servidor=' + UrlDoServidor('');
    SaveStringsToUTF8File(ExpandConstant('{app}\config.ini'), Config, False);
  end;
end;
