; Instalador do CertiManager SERVIDOR para Windows (Inno Setup 6).
;
; Nao compile este arquivo sozinho: rode instalador\windows\empacotar.ps1, que gera antes o
; aplicativo com Java embutido (jpackage) e depois chama o compilador do Inno Setup.
;
; Instala o CertiManager.exe (banco, robo de e-mail e o site na porta 8888), que roda sem janela
; ("fantasma") e mostra um icone na bandeja do Windows. Os outros computadores usam o instalador
; do TERMINAL (CertiManager-Terminal.iss), que le o cartao A3 e abre o site deste servidor.

#ifndef Versao
  #define Versao "1.0.0"
#endif
#ifndef PastaImagem
  #define PastaImagem "..\..\build\windows\imagem\CertiManager"
#endif
#ifndef JarAgente
  #define JarAgente "..\..\build\windows\agente\AgenteTerminal.jar"
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
OutputBaseFilename=CertiManager-Servidor-Setup-{#Versao}
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
Name: "startupicon"; Description: "Iniciar o servidor automaticamente, em segundo plano, quando o Windows ligar (Recomendado)"; GroupDescription: "Inicialização:"

[Dirs]
; O servidor roda na sessão do usuário (por causa do ícone na bandeja) e grava o banco aqui
Name: "{app}"; Permissions: users-modify

[InstallDelete]
; Arquivos do próprio aplicativo, trocados inteiros a cada versão (os dados ficam fora deles)
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\runtime"
; Versão antiga (javaw -jar CertiManager.jar): o iniciar.bat e os atalhos que apontavam para ele
Type: files; Name: "{app}\iniciar.bat"
Type: files; Name: "{userstartup}\CertiManager.lnk"
Type: files; Name: "{autodesktop}\CertiManager.lnk"

[Files]
; Aplicativo com Java embutido gerado pelo jpackage: CertiManager.exe, app\ e runtime\
Source: "{#PastaImagem}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\icones\certimanager.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "Termos.txt"; DestDir: "{app}"; Flags: ignoreversion
; Versao do agente dos terminais que vem com este servidor: os terminais ja instalados consultam
; /api/agente/versao e se atualizam sozinhos para ela (ver AgenteRotas.java)
Source: "{#JarAgente}"; DestDir: "{app}\releases"; DestName: "AgenteTerminal-{#Versao}.jar"; Flags: ignoreversion

[Icons]
; SERVIDOR: os atalhos abrem o sistema no navegador (e sobem o servidor, se estiver parado)
Name: "{autodesktop}\CertiManager"; Filename: "{app}\CertiManager.exe"; Parameters: "--abrir-navegador"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{autoprograms}\CertiManager"; Filename: "{app}\CertiManager.exe"; Parameters: "--abrir-navegador"; WorkingDir: "{app}"
; Na inicialização o servidor sobe sem abrir nada, só com o ícone na bandeja. Fica na pasta de
; inicialização de todos os usuários: se dois entrarem, o segundo percebe que já está rodando e sai.
Name: "{commonstartup}\CertiManager"; Filename: "{app}\CertiManager.exe"; WorkingDir: "{app}"; Tasks: startupicon

[Run]
; Libera a porta 8888 no Firewall do Windows (remove antes para não duplicar a regra ao reinstalar)
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=""CertiManager Web"" >nul 2>&1 & netsh advfirewall firewall add rule name=""CertiManager Web"" dir=in action=allow protocol=TCP localport=8888"; Flags: runhidden; StatusMsg: "Configurando regras de rede local..."

Filename: "{app}\CertiManager.exe"; Parameters: "--abrir-navegador"; WorkingDir: "{app}"; Description: "Iniciar o CertiManager (Servidor) agora"; Flags: nowait postinstall skipifsilent runasoriginaluser

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM CertiManager.exe"; Flags: runhidden; RunOnceId: "PararServidor"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""CertiManager Web"""; Flags: runhidden; RunOnceId: "RemoverFirewall"

[Code]
var
  PagePastas: TInputDirWizardPage;
  PageAdmin: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  { 1. DEFINIÇÃO DAS PASTAS DE SEGURANÇA }
  PagePastas := CreateInputDirPage(wpSelectDir,
    'Diretórios de Segurança',
    'Onde as automações devem salvar as informações?',
    'Selecione os locais ideais para armazenar os backups diários do banco e os relatórios em PDF gerados pelo robô.',
    False, 'Nova Pasta');
  PagePastas.Add('Pasta para armazenamento dos Backups Diários:');
  PagePastas.Add('Pasta para armazenamento dos Relatórios em PDF:');

  { 2. CRIAÇÃO DA CONTA DO ADMINISTRADOR }
  PageAdmin := CreateInputQueryPage(PagePastas.ID,
    'Administrador Principal',
    'Configurar Conta de Acesso Master',
    'Defina as credenciais iniciais que serão utilizadas para realizar o primeiro login no sistema.');
  PageAdmin.Add('E-mail de Login Admin:', False);
  PageAdmin.Add('Senha de Acesso:', True); { Campo oculto por asteriscos }
  { Instalação silenciosa: CertiManager-Servidor-Setup.exe /VERYSILENT /LOGIN=admin@empresa.com.br /SENHA=... }
  PageAdmin.Values[0] := ExpandConstant('{param:LOGIN|admin@escritorio.com.br}');
  PageAdmin.Values[1] := ExpandConstant('{param:SENHA|}');
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

{ Lógica que determina a exibição condicional das janelas }
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = PageAdmin.ID) and BancoJaExiste;
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
  { Na instalação silenciosa o Inno também "clica" em Avançar, mas ninguém veria a mensagem e o
    instalador ficaria parado nela. Sem /SENHA, o servidor cria o admin com a senha padrão. }
  if (CurPageID = PageAdmin.ID) and not WizardSilent then begin
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
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM CertiManager.exe', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  { Versão antiga: "javaw -jar CertiManager.jar". Só encerra esse javaw, não outros programas Java }
  Exec('powershell.exe',
    '-NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter ''Name=''''javaw.exe'''' OR Name=''''java.exe'''''' | ' +
    'Where-Object { $_.CommandLine -like ''*CertiManager.jar*'' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
    '', SW_HIDE, ewWaitUntilTerminated, Codigo);
end;

{ Processamento final: criação do config.ini }
procedure CurStepChanged(CurStep: TSetupStep);
var
  Config: TArrayOfString;
begin
  if CurStep = ssPostInstall then begin
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
    SaveStringsToUTF8File(ExpandConstant('{app}\config.ini'), Config, False);
  end;
end;
