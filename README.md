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
* [SQLite](https://www.sqlite.org/index.html) (Banco de Dados embutido)
* Biblioteca `java.security` (Para leitura do cofre MSCAPI do Windows)

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

O Servidor Central precisa expor esse endpoint de versão, respondendo:
```json
{ "versao": "1.1.0", "url": "http://servidor:8888/downloads/AgenteTerminal-1.1.0.jar", "sha256": "<hash hexadecimal do jar>" }
```
> Esse endpoint ainda não existe no `ServidorLocal` (que também está por implementar) — é o próximo passo para o auto-update funcionar ponta a ponta.

Veja a seção [Compilando e Instalando o AgenteTerminal](#3-compilando-e-instalando-o-agenteterminal-em-cada-terminal) para o passo a passo.

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
> O `ServidorLocal.java` ainda está por implementar neste repositório.

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
