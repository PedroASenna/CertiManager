# 🛡️ CertiManager

O **CertiManager** é um sistema completo e inteligente para gestão de Certificados Digitais (A1, A2, A3 e Nuvem), desenvolvido especialmente para escritórios de contabilidade e empresas de TI. Ele automatiza o controle de vencimentos, facilita a renovação e se integra diretamente aos leitores de Smartcard (USB) dos usuários.

![Demonstração do Sistema](https://img.shields.io/badge/Status-Concluído-success)
![Versão](https://img.shields.io/badge/Versão-1.0.0-blue)
![Licença](https://img.shields.io/badge/Licença-MIT-green)

---

## ✨ Funcionalidades Principais

* 🔌 **Leitura Direta de Hardware (Agente Local):** Lê certificados A1 instalados ou A3 (Smartcards/Tokens USB) inseridos no computador do usuário, preenchendo o formulário de cadastro automaticamente.
* 🤖 **Robô de E-mails Automático:** Verifica diariamente os vencimentos e dispara e-mails de aviso para a equipe ou cobranças diretas para o cliente.
* 📊 **Dashboard Interativo:** Painel gerencial com gráficos de rosca e barras, exibindo estatísticas em tempo real e filtros rápidos clicáveis.
* 📅 **Cálculo Inteligente de Datas:** Sistema calcula o ano de vencimento automaticamente baseado no tipo do certificado (A1 = 1 ano, A2 = 2 anos, A3 = 3 anos).
* 🚨 **Alertas Visuais:** Botões "piscantes" na tabela para certificados vencidos ou prestes a vencer, com atalho de *Renovação Rápida*.
* 📄 **Relatórios PDF Profissionais:** Geração de relatórios filtrados (Geral, Vencidos, Próximos 30 dias) com design minimalista e logo da empresa.
* 📱 **Integração com WhatsApp:** Ficha detalhada do cliente com botão nativo para enviar mensagens automáticas de cobrança via WhatsApp Web.
* 🔍 **Busca de CNPJ via ReceitaWS:** Autocompleta dados empresariais a partir do CNPJ.
* 💾 **Gestão de Banco de Dados:** Backup em um clique e Restauração via arquivo `.sql` direto pela interface.
* 👥 **Controle de Acesso:** Níveis de usuário (0 - Visitante, 1 - Operador, 2 - Administrador) e logs completos de auditoria do sistema.

---

## 🛠️ Tecnologias Utilizadas

**Front-end:**
* [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
* [Vite](https://vitejs.dev/) (Build tool)
* [Tailwind CSS v4](https://tailwindcss.com/) (Estilização)
* [Recharts](https://recharts.org/) (Gráficos)
* [jsPDF](https://github.com/parallax/jsPDF) & [autoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) (Geração de PDFs)

**Back-end:**
* [Java 21+](https://www.oracle.com/java/)
* [Javalin](https://javalin.io/) (Framework Web leve e rápido)
* [SQLite](https://www.sqlite.org/index.html) via [sqlite-jdbc](https://github.com/xerial/sqlite-jdbc) (Banco de Dados embutido, sem ORM)
* [Jakarta Mail](https://eclipse-ee4j.github.io/mail/) (Robô de e-mail via SMTP)
* Biblioteca `java.security` (Para leitura do cofre MSCAPI do Windows e para abrir arquivos `.pfx`/`.p12` na importação em lote)
* JWT e hash de senha (PBKDF2) implementados sem dependências externas, só com a biblioteca padrão do JDK

---

## 🏗️ Arquitetura do Sistema

O sistema é dividido em duas partes principais para contornar a limitação de segurança dos navegadores web, permitindo a leitura de portas USB na rede local:

1. **Servidor Central (`ServidorLocal.java` - Porta 8888):** Roda na máquina principal do escritório. Gerencia o banco de dados SQLite, a rotina de e-mails noturna e hospeda os arquivos do Front-end (pasta `frontend-dist`, configurável — veja a seção de instalação).
2. **Agente de Terminal (`AgenteTerminal.java` - Porta 8889):** Um micro-serviço invisível que roda apenas nos computadores "clientes" (recepção, fiscal). Ele lê o Cofre do Windows (`Windows-MY`/MSCAPI) e se comunica com o site aberto no navegador para a função "Ler do Computador".

Isso não é uma limitação de linguagem, é física: o cofre de certificados e o driver do leitor USB só existem na máquina onde o cartão está fisicamente inserido, então **algum processo precisa rodar localmente em cada terminal** — não existe forma de o Servidor Central ler, pela rede, um cartão inserido em outra máquina. O `AgenteTerminal` é esse processo local; do ponto de vista daquele terminal, ele é "o Servidor".

### 🔄 Atualização automática e instalação como Serviço do Windows

Para não ser necessário visitar cada terminal manualmente a cada nova versão, o `AgenteTerminal` foi desenhado para ser instalado **uma única vez** por máquina:

* **Roda como Serviço do Windows** (via [WinSW](https://github.com/winsw/winsw)): inicia sozinho com o Windows, mesmo sem ninguém logado, e reinicia sozinho se cair.
* **Se auto-atualiza sozinho:** a cada poucas horas, ele consulta `GET {ServidorLocal}/api/agente/versao` no Servidor Central. Se houver uma versão mais nova, baixa o novo `.jar`, confere o hash SHA-256, para o serviço, troca o arquivo e reinicia — tudo sozinho, sem intervenção humana no terminal.

O `ServidorLocal` já expõe esse endpoint de versão:
```json
GET /api/agente/versao
-> { "versao": "1.1.0", "url": "http://servidor:8888/downloads/AgenteTerminal-1.1.0.jar", "sha256": "<hash hexadecimal do jar>" }
```
Publicar uma nova versão do agente é só copiar o `.jar` (nomeado `AgenteTerminal-<versao>.jar`, ex: `AgenteTerminal-1.1.0.jar`) para a pasta `releases/` do `ServidorLocal` — ele descobre sozinho qual é a versão mais recente publicada (pelo nome do arquivo) e calcula o SHA-256 na hora, sem precisar de nenhum arquivo-ponteiro mantido à mão. Se `releases/` estiver vazia, o endpoint responde `404` e o agente simplesmente tenta de novo no próximo ciclo.

Veja as seções [Compilando o Servidor Central](#3-compilando-o-servidor-central) e [Compilando e Instalando o AgenteTerminal](#4-compilando-e-instalando-o-agenteterminal-em-cada-terminal) para o passo a passo.

---

## 🚀 Como Instalar e Compilar

Esse guia assume Windows (é o ambiente mais comum para esse tipo de instalação em escritório), mas os comandos de `npm`/`mvn`/`java` são os mesmos em qualquer sistema — só muda como você abre o terminal e instala os pré-requisitos.

### Pré-requisitos

Instale as três ferramentas abaixo, **nessa ordem**, e confirme cada uma antes de seguir pra próxima.

**1. Node.js** (v18 ou superior) — necessário para compilar o Front-end.
- Baixe em [nodejs.org](https://nodejs.org/) (versão "LTS") e instale normalmente.
- Confirme abrindo um terminal novo e rodando:
  ```
  node -v
  npm -v
  ```

**2. Java JDK** (v21 ou superior) — necessário para compilar e rodar o Back-end.
- Baixe em [adoptium.net](https://adoptium.net/) (Temurin, gratuito) ou [oracle.com/java](https://www.oracle.com/java/technologies/downloads/).
- Confirme:
  ```
  java -version
  ```

**3. Maven** — necessário para compilar o Back-end (`ServidorLocal` e `AgenteTerminal`).
- No Windows, tente primeiro `winget install Apache.Maven` num terminal do PowerShell. Se der "nenhum pacote encontrado" (acontece em algumas versões do Windows), baixe manualmente em [maven.apache.org/download.cgi](https://maven.apache.org/download.cgi) (arquivo `.zip` "Binary"), extraia para uma pasta fixa (ex: `C:\apache-maven`), e adicione a subpasta `bin` dela (ex: `C:\apache-maven\bin`) à variável de ambiente **Path** do Windows (Painel de Controle → Editar as variáveis de ambiente do sistema → Variáveis de Ambiente → selecione `Path` → Editar → Novo).
- Confirme:
  ```
  mvn -v
  ```

> ⚠️ **O erro mais comum nessa etapa é `'mvn' não é reconhecido...` mesmo depois de instalar certinho.** Isso acontece porque o Windows só aplica uma alteração de variável de ambiente (`Path`) em janelas de terminal abertas **depois** da alteração. Se você editou o `Path` com um terminal já aberto, **feche essa janela inteira e abra uma nova** (não basta abrir uma aba nova, se estiver usando Windows Terminal ou o terminal integrado de um editor de código — feche o programa inteiro e abra de novo). Se mesmo assim não funcionar, use o caminho completo como alternativa: `& "C:\apache-maven\bin\mvn.cmd" package` em vez de só `mvn package`.

### 1. Baixando o projeto

Se você tem o `git` instalado, clone o repositório:
```
git clone <url-do-repositorio>
```
Sem `git`, baixe o `.zip` do repositório (botão "Code" → "Download ZIP" no GitHub) e extraia. A diferença importa depois: só quem clonou com `git` consegue rodar `git pull` pra buscar atualizações; quem baixou o `.zip` precisa baixar um `.zip` novo a cada atualização.

### 2. Compilando o Front-end (React)
1. Abra o terminal na pasta `Front-end/docs` (dentro do projeto).
2. Instale as dependências — **esse passo não pode ser pulado**, é ele que baixa o `vite` e tudo mais que o projeto usa:
   ```bash
   npm install
   ```
   > Se você rodar `npm run build` sem ter rodado `npm install` antes, o erro é `'vite' não é reconhecido...` — a solução é sempre rodar `npm install` primeiro.
3. Gere o build de produção:
   ```bash
   npm run build
   ```
   Isso cria a pasta `Front-end/docs/dist`, com um `index.html` e uma subpasta `assets` (os arquivos `.js`/`.css` de verdade). Guarde esse caminho, ele é usado no passo 4.

### 3. Compilando o Servidor Central

O código-fonte fica em `Back-end/ServidorLocal` ([Javalin](https://javalin.io/) + SQLite puro via JDBC, sem ORM). Ele cobre tudo que o Front-end espera da API: login/autenticação (JWT), CRUD de certificados, gestão de usuários e níveis de acesso, logs de auditoria, importação em lote de `.pfx`/`.p12` e de planilha de e-mails, limpeza de duplicatas vencidas, backup/restore via `.sql`, proxy de CNPJ (ReceitaWS), robô diário de e-mail e a distribuição de versões do `AgenteTerminal`, além de hospedar os arquivos estáticos do Front-end.

> Existe um `Front-end/docs/server.ts` em Node/Express que implementa boa parte dessas mesmas funcionalidades — ele **não é o backend real do projeto** (roda numa porta diferente, 3000, e nunca foi ligado à arquitetura de terminal+servidor descrita acima). Serviu apenas como referência do contrato de API ao escrever o `ServidorLocal` em Java; o backend que efetivamente roda em produção é o Java.

**a) Compilar:**
```bash
cd Back-end/ServidorLocal
mvn package
```
Isso gera `target/ServidorLocal.jar`.

**b) Colocar o Front-end dentro da pasta do servidor.** O `ServidorLocal` serve o site a partir de uma pasta chamada `frontend-dist`, ao lado do jar. Copie **o conteúdo** da pasta `Front-end/docs/dist` (gerada no passo 2) para dentro de `frontend-dist`:

```powershell
# rodando a partir da pasta onde está o ServidorLocal.jar (ex: target/, ou onde você copiou o jar)
robocopy "C:\caminho\para\Front-end\docs\dist" .\frontend-dist /E
```

> ⚠️ **Use `robocopy`, não `Copy-Item` do PowerShell** (nem "copiar e colar" pela metade). Quando a pasta de destino ainda não existe, `Copy-Item -Recurse` às vezes copia o `index.html` mas **não** copia a subpasta `assets` direito — o sintoma é a tela abrir toda branca, com o Console do navegador (F12) mostrando erros `404` para arquivos `.js`/`.css`. O `robocopy` (que já vem com o Windows) não tem esse problema. Depois de copiar, confirme que `frontend-dist\assets\` realmente tem arquivos `.js` e `.css` dentro.

Alternativamente, em vez de copiar, você pode apontar a variável `CERTIMANAGER_FRONTEND_DIST_DIR` (veja a tabela abaixo) direto para a pasta `dist` original, sem copiar nada.

**c) Rodar:**
```bash
java -jar target/ServidorLocal.jar
```
Isso sobe o servidor na porta `8888`, cria o banco `database.sqlite` (na primeira execução) e as pastas `releases/` e `backups/`. Abra `http://localhost:8888` no navegador — deve aparecer a tela de login.

> Se aparecer só o texto `{"error":"Nao encontrado"}` em vez da tela de login, é porque o servidor não achou a pasta `frontend-dist` (confira o aviso que aparece no terminal ao iniciar — ele avisa se não achou) — volte no passo (b).

**Usuário administrador padrão** (criado automaticamente na primeira execução, caso ainda não exista nenhum usuário com esse e-mail): `admin@admin.com` / `admin123`. **Troque essa senha assim que possível** — use o próprio sistema (Gestão de Acessos) para criar um administrador novo e remover ou trocar a senha do padrão.

**Variáveis de ambiente opcionais:**

| Variável | Padrão | Descrição |
|---|---|---|
| `CERTIMANAGER_DB_PATH` | `database.sqlite` | Caminho do arquivo do banco SQLite |
| `CERTIMANAGER_JWT_SECRET` | *(gerado automaticamente)* | Segredo usado para assinar os tokens de login. Se não definido, um segredo aleatório é gerado e salvo em `jwt-secret.key` na primeira execução |
| `CERTIMANAGER_RELEASES_DIR` | `releases` | Pasta onde publicar novas versões do `AgenteTerminal.jar` |
| `CERTIMANAGER_BACKUPS_DIR` | `backups` | Pasta onde os backups gerados pelo sistema são salvos |
| `CERTIMANAGER_FRONTEND_DIST_DIR` | `frontend-dist` | Pasta com o build do Front-end a ser servida em `/` (veja o passo b acima) |

Pra definir uma variável de ambiente só para aquela execução, no PowerShell/cmd, antes do `java -jar`:
```
set CERTIMANAGER_FRONTEND_DIST_DIR=C:\caminho\para\a\pasta
java -jar target\ServidorLocal.jar
```

O robô de e-mail (envio diário de avisos de vencimento) só começa a funcionar depois de configurado pela tela "Servidor de E-mails (Robô)" no sistema — ele usa uma conta do Gmail com [senha de aplicativo](https://myaccount.google.com/apppasswords), não a senha normal da conta.

#### Migrando de uma instalação antiga do CertiManager

Se você já tem uma instalação anterior do CertiManager (schema com tabelas `usuarios`/`certificados`/`logs`/`configuracoes_email` em português, senhas em texto puro), existe uma ferramenta de migração única que converte esse banco para o formato novo, re-hasheando as senhas com PBKDF2 (a senha que o usuário já usa continua funcionando):

```bash
java -cp target/ServidorLocal.jar com.certimanager.servidor.ferramentas.MigradorBancoAntigo <banco-antigo.db> <database.sqlite-novo>
```

**Sempre rode contra uma cópia do banco antigo, nunca no arquivo original em produção.** Depois de gerar o `database.sqlite`, suba o `ServidorLocal` apontando `CERTIMANAGER_DB_PATH` para ele (num ambiente de teste primeiro) e confira o login e os dados antes de colocar em produção.

### 4. Compilando e Instalando o AgenteTerminal (em cada terminal)

O código-fonte fica em `Back-end/AgenteTerminal`.

**a) Compilar o jar:**
```bash
cd Back-end/AgenteTerminal
mvn package
```
Isso gera `target/AgenteTerminal.jar` (jar único, sem dependências externas soltas).

**b) Copiar para o terminal com o leitor A3:**
Copie `target/AgenteTerminal.jar` e a pasta `service/` inteira para uma pasta fixa no terminal (ex: `C:\CertiManager\AgenteTerminal\`).

**c) Instalar como Serviço do Windows (rodar uma única vez, como Administrador):**
```powershell
cd C:\CertiManager\AgenteTerminal\service
.\instalar-servico.ps1
```
Esse script baixa o [WinSW](https://github.com/winsw/winsw) automaticamente, registra o `AgenteTerminal` como serviço do Windows e já inicia com a leitura pronta na porta `8889`. Depois disso, o próprio agente cuida de se manter atualizado — não é preciso repetir esse passo nas atualizações seguintes.

Para desinstalar de um terminal, use `desinstalar-servico.ps1` (também como Administrador).

**Variáveis de ambiente opcionais** (definidas no Serviço do Windows ou no ambiente antes de rodar o jar):

| Variável | Padrão | Descrição |
|---|---|---|
| `CERTIMANAGER_SERVIDOR_URL` | `http://localhost:8888` | Endereço do Servidor Central, usado para checar atualizações |
| `CERTIMANAGER_CORS_ORIGIN` | `*` | Origem permitida a chamar a API local (restrinja em produção, ex: `http://servidor:8888`) |
| `CERTIMANAGER_INTERVALO_ATUALIZACAO_HORAS` | `4` | De quantas em quantas horas verifica se há atualização |
| `CERTIMANAGER_AUTO_UPDATE` | `true` | Defina como `false` para desligar o auto-update (útil em testes) |

---

## ▶️ Iniciando o Servidor Central automaticamente com o Windows

Um jeito simples de deixar o `ServidorLocal` rodando sozinho é um arquivo `.bat` (coloque na pasta do jar, e um atalho dele na pasta de Inicialização do Windows — `shell:startup` na barra de endereços do Explorador):

```bat
@echo off
cd /d "%~dp0"
set CERTIMANAGER_FRONTEND_DIST_DIR=%~dp0frontend-dist
start javaw -jar ServidorLocal.jar
exit
```

O `%~dp0` resolve sozinho para a pasta onde o `.bat` está, então funciona em qualquer máquina sem precisar editar caminho nenhum. **Repare na linha `set CERTIMANAGER_FRONTEND_DIST_DIR=...`** — sem ela, o servidor sobe mas o site não aparece (dá o erro `{"error":"Nao encontrado"}`), porque a variável de ambiente que você configurar manualmente numa janela de terminal só vale pra aquela janela, não pra quando o Windows inicia o `.bat` sozinho.

Como ele usa `javaw` (versão do Java sem janela/console), você não verá nenhuma tela — pra saber se está rodando, abra `http://localhost:8888` no navegador.

---

## 🆘 Problemas comuns na instalação

Uma coleção dos erros mais frequentes ao instalar, com a causa e a solução direta.

**`'mvn' não é reconhecido...` (ou `'git'`, `'node'`) mesmo depois de instalar**
→ O terminal que você está usando foi aberto *antes* de você configurar o `Path`. Feche a janela inteira (não só a aba) e abra uma nova. Se persistir, use o caminho completo do programa como alternativa (ex: `& "C:\apache-maven\bin\mvn.cmd" package`).

**`'vite' não é reconhecido...` ao rodar `npm run build`**
→ Faltou rodar `npm install` antes, na pasta `Front-end/docs`. É o `npm install` que baixa o `vite` e as outras dependências para a pasta `node_modules`.

**A tela abre toda branca, sem erro nenhum visível**
→ Abra o Console do navegador (`F12` → aba Console/Network) e recarregue a página. Se aparecerem erros `404` para arquivos `.js`/`.css` dentro de uma pasta `assets`, o build do Front-end foi copiado pela metade (veja o aviso sobre `robocopy` vs. `Copy-Item` no passo 3b). Confirme que `frontend-dist\assets\` realmente tem arquivos dentro.

**A tela mostra só o texto `{"error":"Nao encontrado"}`**
→ O `ServidorLocal` não achou a pasta do Front-end. Confira o aviso impresso no terminal ao subir o servidor (ele avisa a pasta que procurou) e revise o passo 3b (copiar o `dist` para `frontend-dist`, ou apontar `CERTIMANAGER_FRONTEND_DIST_DIR`).

**`Port already in use` / `Address already in use: bind` ao rodar `java -jar`**
→ Já tem outro processo usando a porta 8888 (pode ser uma instância anterior que você esqueceu aberta). Descubra qual é e encerre:
```
netstat -ano | findstr :8888
```
A última coluna de cada linha é o PID do processo. Depois:
```
taskkill /PID <numero-que-apareceu> /F
```

**`O arquivo já está sendo usado por outro processo` ao tentar apagar/mover o `database.sqlite`**
→ O servidor ainda está rodando e com o arquivo aberto. Feche-o primeiro (veja o item acima para achar e encerrar o processo).

**Erro `Nao encontrado` ao clicar em algum botão da tela** (ex: "Disparar Alertas de E-mail")
→ Normalmente indica que a versão do `ServidorLocal.jar` em uso está desatualizada em relação ao Front-end (algum endpoint novo ainda não foi implementado no jar que está rodando). Confirme que puxou a última versão do repositório (`git pull`) e recompilou (`mvn package`) antes de copiar o jar novo para o lugar de produção.
