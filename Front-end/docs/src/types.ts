export interface User {
  email: string;
  role: number;
}

export interface Certificate {
  id: number;
  client_name: string;
  doc_number: string;
  expiry_date: string;
  issue_date: string;
  type: string;
  password?: string;
  email_cliente?: string;
  created_at: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}
