; Instalador do CertiManager para Windows (Inno Setup 6).
;
; Nao compile este arquivo sozinho: rode instalador\windows\empacotar.ps1, que gera antes o
; aplicativo com Java embutido (jpackage) e depois chama o compilador do Inno Setup.
;
; No modo SERVIDOR, instala o CertiManager.exe, que roda sem janela ("fantasma") e mostra um
; icone na bandeja do Windows. No modo TERMINAL, cria apenas o atalho para o endereco do servidor.

#ifndef Versao
  #define Versao "1.0.0"
#endif
#ifndef PastaImagem
  #define PastaImagem "..\..\build\windows\imagem\CertiManager"
#endif

[Setup]
; Mesmo AppId do instalador antigo (o padrao era o AppName), para atualizar a instalacao existente
AppId=CertiManager
AppName=CertiManager
AppVersion={#Versao}
AppVerName=CertiManager {#Versao}
AppPublisher=Pedro Sena & Kaio Rodrigues

; Arquivo de texto obrigatório com a apresentação comercial e termos legais
LicenseFile=Termos.txt

; Instalação direta na raiz do C:\ para evitar bloqueios de permissão (UAC/Windows Defender)
DefaultDirName=C:\CertiManager
DisableProgramGroupPage=yes
OutputBaseFilename=CertiManager-Setup-{#Versao}
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
Name: "startupicon"; Description: "Iniciar o servidor automaticamente, em segundo plano, quando o Windows ligar (Recomendado)"; GroupDescription: "Inicialização:"; Check: IsServer

[Dirs]
; O servidor roda na sessão do usuário (por causa do ícone na bandeja) e grava o banco aqui
Name: "{app}"; Permissions: users-modify

[InstallDelete]
; Arquivos do próprio aplicativo, trocados inteiros a cada versão (os dados ficam fora deles)
Type: filesandordirs; Name: "{app}\app"; Check: IsServer
Type: filesandordirs; Name: "{app}\runtime"; Check: IsServer
; Versão antiga (javaw -jar CertiManager.jar): o iniciar.bat e os atalhos que apontavam para ele
Type: files; Name: "{app}\iniciar.bat"; Check: IsServer
Type: files; Name: "{userstartup}\CertiManager.lnk"; Check: IsServer
Type: files; Name: "{autodesktop}\CertiManager.lnk"; Check: IsServer

[Files]
; Aplicativo com Java embutido gerado pelo jpackage: CertiManager.exe, app\ e runtime\
Source: "{#PastaImagem}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsServer
Source: "..\icones\certimanager.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "Termos.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; SERVIDOR: os atalhos abrem o sistema no navegador (e sobem o servidor, se estiver parado)
Name: "{autodesktop}\CertiManager"; Filename: "{app}\CertiManager.exe"; Parameters: "--abrir-navegador"; WorkingDir: "{app}"; Tasks: desktopicon; Check: IsServer
Name: "{autoprograms}\CertiManager"; Filename: "{app}\CertiManager.exe"; Parameters: "--abrir-navegador"; WorkingDir: "{app}"; Check: IsServer
; Na inicialização o servidor sobe sem abrir nada, só com o ícone na bandeja. Fica na pasta de
; inicialização de todos os usuários: se dois entrarem, o segundo percebe que já está rodando e sai.
Name: "{commonstartup}\CertiManager"; Filename: "{app}\CertiManager.exe"; WorkingDir: "{app}"; Tasks: startupicon; Check: IsServer

; TERMINAL: atalho de internet direto para o endereço do servidor
Name: "{autodesktop}\CertiManager (Terminal)"; Filename: "{code:UrlDoServidor}"; IconFilename: "{app}\certimanager.ico"; Tasks: desktopicon; Check: IsTerminal

[Run]
; Libera a porta 8888 no Firewall do Windows (remove antes para não duplicar a regra ao reinstalar)
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=""CertiManager Web"" >nul 2>&1 & netsh advfirewall firewall add rule name=""CertiManager Web"" dir=in action=allow protocol=TCP localport=8888"; Flags: runhidden; Check: IsServer; StatusMsg: "Configurando regras de rede local..."

Filename: "{app}\CertiManager.exe"; Parameters: "--abrir-navegador"; WorkingDir: "{app}"; Description: "Iniciar o CertiManager (Servidor) agora"; Flags: nowait postinstall skipifsilent runasoriginaluser; Check: IsServer
Filename: "{code:UrlDoServidor}"; Description: "Acessar o CertiManager (Terminal) agora"; Flags: shellexec nowait postinstall skipifsilent runasoriginaluser; Check: IsTerminal

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM CertiManager.exe"; Flags: runhidden; RunOnceId: "PararServidor"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""CertiManager Web"""; Flags: runhidden; RunOnceId: "RemoverFirewall"

[Code]
var
  PageModo: TInputOptionWizardPage;
  PagePastas: TInputDirWizardPage;
  PageAdmin: TInputQueryWizardPage;
  PageIP: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  { 1. TELA DE SELEÇÃO: SERVIDOR OU TERMINAL }
  PageModo := CreateInputOptionPage(wpSelectDir,
    'Configuração de Rede do Escritório',
    'Como este computador será utilizado na rede?',
    'Selecione o modo de operação do CertiManager para esta máquina. Se este for o computador principal, selecione Servidor.',
    True, False);
  PageModo.Add('SERVIDOR: Este computador hospedará o banco de dados principal e o motor do sistema.');
  PageModo.Add('TERMINAL: Este computador apenas acessará a interface de um sistema já instalado em outra máquina.');
  PageModo.Values[0] := True; { Define Servidor como padrão }

  { 2. TELA EXCLUSIVA DO TERMINAL: SOLICITAÇÃO DO IP DO SERVIDOR }
  PageIP := CreateInputQueryPage(PageModo.ID,
    'Configuração do Terminal',
    'Conexão com o Servidor Local',
    'Informe o endereço IP local do computador configurado como Servidor (exemplo: 192.168.1.50).');
  PageIP.Add('Endereço IP do Servidor:', False);
  PageIP.Values[0] := '';

  { 3. TELA EXCLUSIVA DO SERVIDOR: DEFINIÇÃO DAS PASTAS DE SEGURANÇA }
  PagePastas := CreateInputDirPage(PageIP.ID,
    'Diretórios de Segurança',
    'Onde as automações devem salvar as informações?',
    'Selecione os locais ideais para armazenar os backups diários do banco e os relatórios em PDF gerados pelo robô.',
    False, 'Nova Pasta');
  PagePastas.Add('Pasta para armazenamento dos Backups Diários:');
  PagePastas.Add('Pasta para armazenamento dos Relatórios em PDF:');

  { 4. TELA EXCLUSIVA DO SERVIDOR: CRIAÇÃO DA CONTA DO ADMINISTRADOR }
  PageAdmin := CreateInputQueryPage(PagePastas.ID,
    'Administrador Principal',
    'Configurar Conta de Acesso Master',
    'Defina as credenciais iniciais que serão utilizadas para realizar o primeiro login no sistema.');
  PageAdmin.Add('E-mail de Login Admin:', False);
  PageAdmin.Add('Senha de Acesso:', True); { Campo oculto por asteriscos }
  PageAdmin.Values[0] := 'admin@escritorio.com.br';
end;

{ Funções auxiliares para controle de fluxo das telas e tarefas }
function IsServer: Boolean;
begin
  Result := PageModo.Values[0];
end;

function IsTerminal: Boolean;
begin
  Result := PageModo.Values[1];
end;

{ Atualização: já existe um banco nesta pasta, então os usuários (e o admin) já existem }
function BancoJaExiste: Boolean;
begin
  Result := FileExists(AddBackslash(WizardDirValue) + 'database.sqlite');
end;

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

function UrlDoServidor(Param: String): String;
var
  Endereco: String;
begin
  Endereco := Trim(PageIP.Values[0]);
  if Pos('://', Endereco) > 0 then
    Delete(Endereco, 1, Pos('://', Endereco) + 2);
  while (Length(Endereco) > 0) and (Endereco[Length(Endereco)] = '/') do
    Delete(Endereco, Length(Endereco), 1);
  if Pos(':', Endereco) = 0 then
    Endereco := Endereco + ':8888';
  Result := 'http://' + Endereco;
end;

{ Lógica que determina a exibição condicional das janelas }
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (PageID = PagePastas.ID) and IsTerminal then
    Result := True;
  if (PageID = PageAdmin.ID) and (IsTerminal or BancoJaExiste) then
    Result := True;
  if (PageID = PageIP.ID) and IsServer then
    Result := True;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = PagePastas.ID) and (PagePastas.Values[0] = '') then begin
    PagePastas.Values[0] := LerConfigExistente('PastaBackup');
    PagePastas.Values[1] := LerConfigExistente('PastaRelatorios');
    if PagePastas.Values[0] = '' then
      PagePastas.Values[0] := AddBackslash(WizardDirValue) + 'Backups';
    if PagePastas.Values[1] = '' then
      PagePastas.Values[1] := AddBackslash(WizardDirValue) + 'Relatorios';
  end;
end;

{ Validação dos dados digitados para evitar campos em branco }
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = PageIP.ID) and IsTerminal then begin
    if Trim(PageIP.Values[0]) = '' then begin
      MsgBox('Você precisa informar o endereço IP do Servidor para continuar.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if (CurPageID = PageAdmin.ID) and IsServer then begin
    if Trim(PageAdmin.Values[0]) = '' then begin
      MsgBox('O campo E-mail de Login não pode ficar vazio.', mbError, MB_OK);
      Result := False;
    end else if Trim(PageAdmin.Values[1]) = '' then begin
      MsgBox('Você precisa definir uma senha para o Administrador.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

{ Para o servidor que estiver rodando, senão os arquivos dele ficam travados }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
begin
  Result := '';
  if IsServer then begin
    Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM CertiManager.exe', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
    { Versão antiga: "javaw -jar CertiManager.jar". Só encerra esse javaw, não outros programas Java }
    Exec('powershell.exe',
      '-NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter ''Name=''''javaw.exe'''' OR Name=''''java.exe'''''' | ' +
      'Where-Object { $_.CommandLine -like ''*CertiManager.jar*'' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
      '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  end;
end;

{ Processamento final: criação do config.ini }
procedure CurStepChanged(CurStep: TSetupStep);
var
  Config: TArrayOfString;
begin
  if CurStep = ssPostInstall then begin
    if IsServer then begin
      { O servidor usa Login/Senha para criar o admin no primeiro start e depois apaga a senha daqui }
      if BancoJaExiste then
        SetArrayLength(Config, 3)
      else
        SetArrayLength(Config, 5);
      Config[0] := 'Modo=SERVIDOR';
      Config[1] := 'PastaBackup=' + PagePastas.Values[0];
      Config[2] := 'PastaRelatorios=' + PagePastas.Values[1];
      if not BancoJaExiste then begin
        Config[3] := 'Login=' + Trim(PageAdmin.Values[0]);
        Config[4] := 'Senha=' + PageAdmin.Values[1];
      end;
    end else begin
      SetArrayLength(Config, 2);
      Config[0] := 'Modo=TERMINAL';
      Config[1] := 'Servidor=' + UrlDoServidor('');
    end;
    SaveStringsToUTF8File(ExpandConstant('{app}\config.ini'), Config, False);
  end;
end;
