import { Certificate } from "../types";

const API_URL = "/api";

export const api = {
  async login(email: string, password: string): Promise<{ token: string; user: any }> {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Falha no login");
    return res.json();
  },

  async getCertificates(token: string): Promise<Certificate[]> {
    const res = await fetch(`${API_URL}/certificates`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Erro ao buscar certificados");
    return res.json();
  },

  async addCertificate(token: string, data: Partial<Certificate>) {
    const res = await fetch(`${API_URL}/certificates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erro ao salvar certificado");
    }
    return res.json();
  },

  async editCertificate(token: string, id: number, data: Partial<Certificate>) {
    const res = await fetch(`${API_URL}/certificates/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erro ao editar certificado");
    }
    return res.json();
  },

  async deleteCertificate(token: string, id: number) {
    const res = await fetch(`${API_URL}/certificates/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Erro ao remover certificado");
    return res.json();
  },

  // --------------------------------------------------------
  // NOVAS FUNÇÕES PARA USUÁRIOS E LOGS
  // --------------------------------------------------------
  async getLogs(token: string) {
    const res = await fetch(`${API_URL}/logs`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },

  async getUsers(token: string) {
    const res = await fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },

  async addUser(token: string, data: any) {
    const res = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Erro ao criar usuário");
    return res.json();
  },

  async deleteUser(token: string, id: number) {
    await fetch(`${API_URL}/users/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  },
  // --------------------------------------------------------

  async importBatch(token: string, files: FileList) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append("files", files[i]);
    const res = await fetch(`${API_URL}/import-batch`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
    return res.json();
  },

  async importCSV(token: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/import-csv`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
    return res.json();
  },

  async runGarbageCollector(token: string) {
    const res = await fetch(`${API_URL}/garbage-collector`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },

  async triggerBackup(token: string) {
    const res = await fetch(`${API_URL}/backup`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },

  // === NOVA FUNÇÃO DE RESTAURAÇÃO ===
  async restoreBackup(token: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_URL}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro crítico ao restaurar o banco de dados.');
    }
    return res.json();
  },

  async lookupCNPJ(cnpj: string) {
    const res = await fetch(`${API_URL}/cnpj/${cnpj}`);
    return res.json();
  },

  // --------------------------------------------------------
  // FUNÇÕES DO ROBÔ DE E-MAIL
  // --------------------------------------------------------
  async getConfigEmail(token: string) {
    const res = await fetch(`${API_URL}/config-email`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Erro ao buscar configuração de e-mail');
    return res.json();
  },

  async saveConfigEmail(token: string, data: any) {
    const res = await fetch(`${API_URL}/config-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Erro ao salvar configuração de e-mail');
    return res.json();
  },

  async triggerEmailRobot(token: string) {
    const res = await fetch(`${API_URL}/trigger-email-robot`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao acionar robô de e-mails');
    }
    return res.json();
  },

  async getEmailLogs(token: string) {
    const res = await fetch(`${API_URL}/email-logs`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },

  // === BUSCAR CERTIFICADOS ESPETADOS NO COMPUTADOR ===
  async getLocalCerts(token: string) {
    try {
      // Ele vai tentar conversar com o mini-robô rodando no computador de quem abriu a tela
      const res = await fetch(`http://localhost:8889/api/local-certs`);
      if (!res.ok) throw new Error("Erro do agente");
      const certs = await res.json();
      // O AgenteTerminal devolve o subjectDN do certificado; no padrão ICP-Brasil o CN é "NOME:CPF/CNPJ".
      return certs.map((c: any) => {
        const cn = (/(?:^|,)CN=((?:\\.|[^,])*)/.exec(c.subjectDN || '')?.[1] || c.alias || '').replace(/\\(.)/g, '$1');
        const separador = cn.lastIndexOf(':');
        return {
          nome: c.nome ?? (separador > 0 ? cn.slice(0, separador) : cn).trim(),
          cpf_cnpj: c.cpf_cnpj ?? (separador > 0 ? cn.slice(separador + 1).replace(/\D/g, '') : ''),
          data_vencimento: c.data_vencimento ?? (c.validoAte || '').slice(0, 10),
        };
      });
    } catch (err) {
      throw new Error("AGENTE_NAO_ENCONTRADO");
    }
  }
};