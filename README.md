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
2. **Agente de Terminal (`AgenteTerminal.java` - Porta 8889):** Um micro-serviço invisível que roda apenas nos computadores "clientes" (recepção, fiscal). Ele lê o Cofre do Windows e se comunica com o site aberto no navegador para a função "Ler do Computador".

---

## 🚀 Como Instalar e Compilar

### Pré-requisitos
* Node.js (v18+)
* Java JDK (v17 ou superior)
* Maven instalado / Eclipse IDE

### 1. Compilando o Front-end (React)
1. Abra o terminal na pasta raiz do front-end.
2. Instale as dependências:
   ```bash
   npm install
