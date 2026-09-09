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

1. **Servidor Central (`ServidorLocal.java` - Porta 8888):** Roda na máquina principal do escritório. Gerencia o banco de dados SQLite, a rotina de e-mails noturna e hospeda os arquivos do Front-end (pasta `public`).
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

Veja as seções [Compilando o Servidor Central](#2-compilando-o-servidor-central) e [Compilando e Instalando o AgenteTerminal](#3-compilando-e-instalando-o-agenteterminal-em-cada-terminal) para o passo a passo.

---

## 🚀 Como Instalar e Compilar

### Pré-requisitos
* Node.js (v18+)
* Java JDK (v17 ou superior)
* Maven instalado / Eclipse IDE

### 1. Compilando o Front-end (React)
1. Abra o terminal na pasta raiz do front-end (`Front-end/docs`).
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Gere o build de produção:
   ```bash
   npm run build
   ```

### 2. Compilando o Servidor Central

O código-fonte fica em `Back-end/ServidorLocal` ([Javalin](https://javalin.io/) + SQLite puro via JDBC, sem ORM). Ele cobre tudo que o Front-end espera da API: login/autenticação (JWT), CRUD de certificados, gestão de usuários e níveis de acesso, logs de auditoria, importação em lote de `.pfx`/`.p12` e de planilha de e-mails, limpeza de duplicatas vencidas, backup/restore via `.sql`, proxy de CNPJ (ReceitaWS), robô diário de e-mail e a distribuição de versões do `AgenteTerminal`, além de hospedar os arquivos estáticos do Front-end.

> Existe um `Front-end/docs/server.ts` em Node/Express que implementa boa parte dessas mesmas funcionalidades — ele **não é o backend real do projeto** (roda numa porta diferente, 3000, e nunca foi ligado à arquitetura de terminal+servidor descrita acima). Serviu apenas como referência do contrato de API ao escrever o `ServidorLocal` em Java; o backend que efetivamente roda em produção é o Java.

```bash
cd Back-end/ServidorLocal
mvn package
java -jar target/ServidorLocal.jar
```
Isso sobe o servidor na porta `8888`, cria o banco `database.sqlite` (na primeira execução) e as pastas `releases/` e `backups/`.

**Usuário administrador padrão** (criado automaticamente na primeira execução, caso ainda não exista nenhum usuário com esse e-mail): `admin@admin.com` / `admin123`. **Troque essa senha assim que possível** — use o próprio sistema (Gestão de Acessos) para criar um administrador novo e remover ou trocar a senha do padrão.

**Variáveis de ambiente opcionais:**

| Variável | Padrão | Descrição |
|---|---|---|
| `CERTIMANAGER_DB_PATH` | `database.sqlite` | Caminho do arquivo do banco SQLite |
| `CERTIMANAGER_JWT_SECRET` | *(gerado automaticamente)* | Segredo usado para assinar os tokens de login. Se não definido, um segredo aleatório é gerado e salvo em `jwt-secret.key` na primeira execução |
| `CERTIMANAGER_RELEASES_DIR` | `releases` | Pasta onde publicar novas versões do `AgenteTerminal.jar` |
| `CERTIMANAGER_BACKUPS_DIR` | `backups` | Pasta onde os backups gerados pelo sistema são salvos |
| `CERTIMANAGER_FRONTEND_DIST_DIR` | `frontend-dist` | Pasta com o build do Front-end (`npm run build` gera em `Front-end/docs/dist`; copie o conteúdo para cá, ou aponte a variável para lá) a ser servida em `/` |

O robô de e-mail (envio diário de avisos de vencimento) só começa a funcionar depois de configurado pela tela "Servidor de E-mails (Robô)" no sistema — ele usa uma conta do Gmail com [senha de aplicativo](https://myaccount.google.com/apppasswords), não a senha normal da conta.

### 3. Compilando e Instalando o AgenteTerminal (em cada terminal)

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
