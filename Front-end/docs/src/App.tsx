import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldCheck, Trash2, Eye, EyeOff, Search, Plus, LogOut,
  AlertTriangle, CheckCircle2, Settings, ChevronDown, FileSpreadsheet,
  Database, History, Users, Edit, Filter, Trash,
  Copy, Check, Moon, Sun, BarChart2, TableProperties, FileDown, FileText, X, Mail,
  Loader2, RefreshCw, CalendarClock, FileBadge, MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from './services/api';
import { Certificate, User } from './types';
import { format, differenceInDays, parseISO, addMonths, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatCpfCnpj = (value: string) => {
  if (!value) return '';
  const num = value.replace(/\D/g, '');
  if (num.length <= 11) {
    return num.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    return num.substring(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
};

// O ano de vencimento sai do tipo do certificado: A1 vale 1 ano, A2 vale 2 e A3 vale 3.
const calcularAnoVencimento = (tipo: string) => {
  if (!tipo) return new Date().getFullYear() + 1;
  const tipoMinusculo = tipo.toLowerCase();
  const anoAtual = new Date().getFullYear();
  if (tipoMinusculo.includes('a2')) return anoAtual + 2;
  if (tipoMinusculo.includes('a3')) return anoAtual + 3;
  return anoAtual + 1;
};

// navigator.clipboard só existe em HTTPS/localhost; nos terminais (http://ip-do-servidor:8888) usa o fallback.
const copiarTexto = (texto: string) => {
  if (!texto) return false;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto);
    return true;
  }
  const textArea = document.createElement('textarea');
  textArea.value = texto;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  textArea.setAttribute('readonly', '');
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let copiou = false;
  try {
    copiou = document.execCommand('copy');
  } catch (err) {
    console.error('Erro no fallback de cópia:', err);
  }
  document.body.removeChild(textArea);
  return copiou;
};

// Alterna entre a data de vencimento e o convite "Atualizar" nos certificados vencidos ou perto de vencer.
const BotaoRenovar = ({ formattedDate, days, onClick, isDark }: any) => {
  const [mostrarAtualizar, setMostrarAtualizar] = useState(false);

  useEffect(() => {
    const intervalo = setInterval(() => setMostrarAtualizar(atual => !atual), 2500);
    return () => clearInterval(intervalo);
  }, []);

  const vencido = days < 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-[145px] h-8 flex items-center justify-center rounded-lg border font-bold transition-all shadow-sm overflow-hidden cursor-pointer ${vencido ? (isDark ? 'bg-red-900/20 border-red-800/50 text-red-400 hover:bg-red-900/60' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100') : (isDark ? 'bg-amber-900/20 border-amber-800/50 text-amber-400 hover:bg-amber-900/60' : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100')}`}
      title="Clique para renovar e atualizar este certificado"
    >
      <AnimatePresence mode="wait">
        {mostrarAtualizar ? (
          <motion.span key="btn" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute flex items-center gap-1 text-[11px] font-extrabold uppercase">
            <RefreshCw className="w-3 h-3" /> Atualizar
          </motion.span>
        ) : (
          <motion.span key="date" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute text-xs">
            {formattedDate}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
};

const DropdownMenu = ({ title, icon: Icon, isDark, children }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fecharAoClicarFora = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', fecharAoClicarFora);
    return () => document.removeEventListener('mousedown', fecharAoClicarFora);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className={`flex items-center gap-2 border px-4 py-2 rounded-full transition-all font-medium text-sm shadow-sm cursor-pointer ${isDark ? 'bg-slate-800 border-slate-600 hover:border-emerald-500 hover:text-emerald-400' : 'bg-white border-neutral-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700'}`}>
        {Icon && <Icon className="w-4 h-4" />} {title} <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className={`absolute right-0 mt-2 w-64 border rounded-2xl shadow-xl z-50 overflow-hidden py-2 ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-neutral-100'}`}>
            {typeof children === 'function' ? children(() => setIsOpen(false)) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DropdownItem = ({ icon: Icon, label, onClick, danger = false, highlight = false, isDark }: any) => (
  <button
    type="button"
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors cursor-pointer ${danger ? (isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-600 hover:bg-red-50') : highlight ? (isDark ? 'text-emerald-400 hover:bg-emerald-900/30 font-semibold' : 'text-emerald-600 hover:bg-emerald-50 font-semibold') : (isDark ? 'text-slate-300 hover:bg-slate-700 hover:text-emerald-400' : 'text-neutral-700 hover:bg-emerald-50 hover:text-emerald-700')}`}
  >
    {Icon && <Icon className="w-4 h-4 shrink-0" />} <span>{label}</span>
  </button>
);

export default function App() {
  const [token, setToken] = useState<string | null>(sessionStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(JSON.parse(sessionStorage.getItem('user') || 'null'));
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [isDark, setIsDark] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [viewMode, setViewMode] = useState<'table' | 'dashboard'>('dashboard');

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('VENCIMENTO_ASC');
  const [quickFilter, setQuickFilter] = useState('ALL');

  const [detailsCert, setDetailsCert] = useState<Certificate | null>(null);
  const [renewCert, setRenewCert] = useState<Certificate | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [showModal, setShowModal] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const [email, setEmail] = useState(() => localStorage.getItem('usuarioCertiManager') || '');
  const [password, setPassword] = useState('');

  useEffect(() => { localStorage.setItem('theme', isDark ? 'dark' : 'light'); }, [isDark]);
  useEffect(() => { if (token) loadCertificates(); }, [token]);

  const loadCertificates = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.getCertificates(token);
      setCertificates(data);
    } finally { setLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const res = await api.login(email, password);
      // Pequena pausa para a animação "Acessando o Cofre..." aparecer
      setTimeout(() => {
        setToken(res.token);
        setUser(res.user);
        localStorage.setItem('usuarioCertiManager', email);
        sessionStorage.setItem('token', res.token);
        sessionStorage.setItem('user', JSON.stringify(res.user));
        setIsLoggingIn(false);
      }, 1500);
    } catch (err) {
      alert('Credenciais inválidas');
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setPassword('');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  };

  const notify = (msg: string) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const handleCopyPassword = (e: React.MouseEvent, id: number, pass: string) => {
    e.stopPropagation();
    if (!pass) return notify('⚠️ Sem senha cadastrada!');
    copiarTexto(pass);
    setCopiedId(id);
    notify('🔑 Senha copiada com sucesso!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredCerts = useMemo(() => {
    return certificates.filter(c => {
      const nomeSeguro = c.client_name ? c.client_name.toLowerCase() : '';
      const docSeguro = c.doc_number ? c.doc_number.toLowerCase() : '';
      if (!(nomeSeguro.includes(searchTerm.toLowerCase()) || docSeguro.includes(searchTerm.toLowerCase()))) return false;

      const days = c.expiry_date ? differenceInDays(startOfDay(parseISO(c.expiry_date)), startOfDay(new Date())) : 0;
      if (quickFilter === 'VENCIDOS') return days < 0;
      if (quickFilter === 'PROXIMOS') return days >= 0 && days <= 30;
      if (quickFilter.startsWith('MONTH_')) {
        const mesFiltrado = quickFilter.replace('MONTH_', '');
        if (!c.expiry_date) return false;
        const mes = format(parseISO(c.expiry_date), 'LLLL/yyyy', { locale: ptBR });
        return mes.charAt(0).toUpperCase() + mes.slice(1) === mesFiltrado;
      }
      return true;
    }).sort((a, b) => {
      const nomeA = a.client_name || '';
      const nomeB = b.client_name || '';
      const dataA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
      const dataB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
      const diasA = a.expiry_date ? differenceInDays(startOfDay(parseISO(a.expiry_date)), startOfDay(new Date())) : 0;
      const diasB = b.expiry_date ? differenceInDays(startOfDay(parseISO(b.expiry_date)), startOfDay(new Date())) : 0;

      switch (sortOrder) {
        case 'NOME_ASC': return nomeA.localeCompare(nomeB);
        case 'NOME_DESC': return nomeB.localeCompare(nomeA);
        case 'VENCIMENTO_ASC': return dataA - dataB;
        case 'VENCIMENTO_DESC': return dataB - dataA;
        case 'STATUS_VENCIDO': return diasA - diasB;
        case 'TIPO': return (a.type || '').localeCompare(b.type || '');
        default: return 0;
      }
    });
  }, [certificates, searchTerm, sortOrder, quickFilter]);

  const stats = useMemo(() => {
    let expired = 0; let expiring30Days = 0; const hoje = startOfDay(new Date());
    certificates.forEach(c => {
      if (c.expiry_date) {
        const days = differenceInDays(startOfDay(parseISO(c.expiry_date)), hoje);
        if (days < 0) expired++; else if (days <= 30) expiring30Days++;
      }
    });
    return { total: certificates.length, expired, expiring30Days };
  }, [certificates]);

  const pieData = useMemo(() => {
    const counts: Record<string, number> = {};
    certificates.forEach(c => {
      const t = c.type ? c.type.split(' - ')[0] : 'Indefinido';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [certificates]);
  const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899'];

  const barData = useMemo(() => {
    const data = []; const today = new Date();
    for (let i = 0; i < 6; i++) {
      const targetMonth = addMonths(today, i);
      // Formatação com a primeira letra do Mês maiúscula (Ex: Abril/2026)
      const rawMonthStr = format(targetMonth, 'LLLL/yyyy', { locale: ptBR });
      const monthStr = rawMonthStr.charAt(0).toUpperCase() + rawMonthStr.slice(1);

      const count = certificates.filter(c => {
        if (!c.expiry_date) return false;
        const d = parseISO(c.expiry_date);
        return d.getMonth() === targetMonth.getMonth() && d.getFullYear() === targetMonth.getFullYear();
      }).length;
      data.push({ name: monthStr, Vencimentos: count });
    }
    return data;
  }, [certificates]);

  const themeBg = isDark ? 'bg-slate-900' : 'bg-[#F5F5F0]';
  const themeText = isDark ? 'text-slate-200' : 'text-neutral-900';
  const themeCard = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-neutral-200';
  const themeInput = isDark ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-neutral-50 border-neutral-200 text-neutral-900';

  const getStatusInfo = (days: number) => {
    if (days < 0) return { text: `Vencido há ${Math.abs(days)} dias`, color: isDark ? 'text-red-400 bg-red-900/20' : 'text-red-700 bg-red-50 border-red-200' };
    if (days === 0) return { text: 'Vence hoje', color: isDark ? 'text-yellow-400 bg-yellow-900/20' : 'text-yellow-700 bg-yellow-50 border-yellow-200' };
    if (days <= 30) return { text: `Vence em ${days} dias`, color: isDark ? 'text-yellow-400 bg-yellow-900/20' : 'text-yellow-700 bg-yellow-50 border-yellow-200' };
    return { text: `Vence em ${days} dias`, color: isDark ? 'text-emerald-400 bg-emerald-900/20' : 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  };

  if (!token) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${themeBg} ${themeText}`}>
        <div className="absolute top-6 right-6">
          <button onClick={() => setIsDark(!isDark)} className={`p-3 rounded-full ${themeCard} hover:ring-2 ring-emerald-500 transition-all`}>
            {isDark ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>
        </div>
        <AnimatePresence mode="wait">
          {isLoggingIn ? (
            <motion.div key="loading" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={`p-10 rounded-3xl shadow-2xl flex flex-col items-center justify-center border ${themeCard}`}>
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
              <h3 className="text-lg font-serif italic mb-1">Acessando o Cofre...</h3>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Sincronizando certificados e validando segurança.</p>
            </motion.div>
          ) : (
            <motion.div key="login" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className={`p-8 rounded-3xl shadow-xl w-full max-w-md border ${themeCard}`}>
              <div className="flex justify-center mb-6"><div className="bg-emerald-600 p-3 rounded-2xl"><ShieldCheck className="text-white w-8 h-8" /></div></div>
              <h2 className="text-2xl font-serif text-center mb-8 italic">CertiManager Login</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={`text-xs uppercase tracking-widest font-semibold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Usuário</label>
                  <input type="text" className={`w-full p-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none border transition-colors ${themeInput}`} value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div>
                  <label className={`text-xs uppercase tracking-widest font-semibold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Senha</label>
                  <input type="password" className={`w-full p-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none border transition-colors ${themeInput}`} value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <button type="submit" className="w-full bg-emerald-600 text-white p-4 rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-lg cursor-pointer">Entrar no Sistema</button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const sortTitle = ({
    VENCIMENTO_ASC: 'Vencimento: mais antigos primeiro',
    VENCIMENTO_DESC: 'Vencimento: mais recentes primeiro',
    NOME_ASC: 'Cliente: A-Z',
    NOME_DESC: 'Cliente: Z-A',
    STATUS_VENCIDO: 'Status: vencidos primeiro',
    TIPO: 'Tipo: A1, A3, Nuvem',
  } as Record<string, string>)[sortOrder];

  const separador = <div className={`h-px my-1 mx-2 ${isDark ? 'bg-slate-700' : 'bg-neutral-100'}`}></div>;

  return (
    <div className={`min-h-screen font-sans pb-20 transition-colors duration-300 ${themeBg} ${themeText}`}>

      <header className={`border-b px-6 py-4 flex items-center justify-between sticky top-0 z-40 transition-colors duration-300 ${themeCard}`}>
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-lg"><ShieldCheck className="text-white w-5 h-5" /></div>
          <h1 className="text-xl font-serif italic font-medium">CertiManager</h1>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setIsDark(!isDark)} className={`p-2 rounded-full transition-colors border shadow-sm cursor-pointer ${isDark ? 'bg-slate-700 text-yellow-400 border-slate-600 hover:bg-slate-600' : 'bg-white text-slate-600 border-neutral-200 hover:bg-neutral-50'}`}>
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {user && user.role >= 2 && (
            <div className="relative">
              <button type="button" onClick={() => setShowModal('sys')} className={`p-2 rounded-full transition-colors flex items-center justify-center shadow-sm border cursor-pointer ${isDark ? 'bg-slate-700 border-slate-600 text-emerald-400 hover:bg-slate-600' : 'bg-white border-neutral-200 text-emerald-600 hover:bg-emerald-50'}`} title="Configurações do Sistema">
                <Settings className="w-5 h-5" />
              </button>
              {showModal === 'sys' && (
                <div className="fixed inset-0 z-50" onClick={() => setShowModal(null)}>
                  <motion.div onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={`absolute right-6 top-16 w-64 border shadow-2xl rounded-2xl overflow-hidden py-2 ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-neutral-100'}`}>
                    <DropdownItem icon={Mail} label="Configurar Robô de E-mails" highlight isDark={isDark} onClick={() => setShowModal('configEmail')} />
                    {separador}
                    <DropdownItem icon={Users} label="Usuários do Sistema" isDark={isDark} onClick={() => setShowModal('users')} />
                    <DropdownItem icon={Database} label="Backup do Banco" isDark={isDark} onClick={async () => { setShowModal(null); await api.triggerBackup(token); notify('Backup realizado com sucesso!'); }} />
                    <DropdownItem icon={Database} label="Restaurar Backup (.sql)" danger isDark={isDark} onClick={() => setShowModal('restore')} />
                    {separador}
                    <DropdownItem icon={History} label="Auditoria (Logs)" isDark={isDark} onClick={() => setShowModal('logs')} />
                    <DropdownItem icon={Trash} label="Faxina de Vencidos" danger isDark={isDark} onClick={async () => {
                      setShowModal(null);
                      if (window.confirm('Limpar duplicatas vencidas?')) { const res = await api.runGarbageCollector(token); notify(res.message); loadCertificates(); }
                    }} />
                  </motion.div>
                </div>
              )}
            </div>
          )}

          <div className={`text-right hidden sm:block border-l pl-4 ${isDark ? 'border-slate-700' : 'border-neutral-200'}`}>
            <p className="text-sm font-medium uppercase">{user?.email}</p>
            <p className={`text-[10px] uppercase tracking-tighter ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Nível {user?.role}</p>
          </div>
          <button onClick={handleLogout} className={`p-2 rounded-full transition-colors cursor-pointer ${isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-600'}`}><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">

        <div className={`sticky top-[85px] z-30 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 p-4 rounded-2xl border shadow-md transition-all duration-300 backdrop-blur-xl ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white/80 border-neutral-200'}`}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-neutral-400'}`} />
              <input type="text" placeholder="Buscar cliente ou documento..." className={`pl-10 pr-4 py-2 rounded-full w-64 focus:ring-2 focus:ring-emerald-500 outline-none text-sm border transition-colors ${themeInput}`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className={`flex items-center p-1 rounded-full border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-neutral-100 border-neutral-200'}`}>
              <button onClick={() => { setViewMode('table'); setQuickFilter('ALL'); }} className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${viewMode === 'table' && quickFilter === 'ALL' ? 'bg-emerald-600 text-white shadow-sm' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-neutral-500 hover:text-neutral-700')}`}>
                <TableProperties className="w-4 h-4" /> Tabela Global
              </button>
              <button onClick={() => setViewMode('dashboard')} className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${viewMode === 'dashboard' ? 'bg-emerald-600 text-white shadow-sm' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-neutral-500 hover:text-neutral-700')}`}>
                <BarChart2 className="w-4 h-4" /> Painel Resumo
              </button>
            </div>
            {quickFilter !== 'ALL' && viewMode === 'table' && (
              <div className={`text-xs px-3 py-1.5 rounded-full border font-bold flex items-center gap-2 ${quickFilter === 'VENCIDOS' ? 'bg-red-100 text-red-700 border-red-200' : quickFilter === 'PROXIMOS' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                <Filter className="w-3 h-3" />
                <span>Filtrando: {quickFilter === 'VENCIDOS' ? 'Já Vencidos' : quickFilter === 'PROXIMOS' ? 'Vencem em 30 Dias' : `Mês: ${quickFilter.replace('MONTH_', '')}`} ({filteredCerts.length} certificados)</span>
                <button onClick={() => setQuickFilter('ALL')} className="hover:bg-black/10 rounded-full p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {viewMode === 'table' && (
              <DropdownMenu title={`Ordenar: ${sortTitle}`} icon={Filter} isDark={isDark}>
                {(fechar: () => void) => (
                  <>
                    <DropdownItem isDark={isDark} label="Vencimento: mais antigos primeiro" onClick={() => { fechar(); setSortOrder('VENCIMENTO_ASC'); }} />
                    <DropdownItem isDark={isDark} label="Vencimento: mais recentes primeiro" onClick={() => { fechar(); setSortOrder('VENCIMENTO_DESC'); }} />
                    {separador}
                    <DropdownItem isDark={isDark} label="Cliente: A - Z" onClick={() => { fechar(); setSortOrder('NOME_ASC'); }} />
                    <DropdownItem isDark={isDark} label="Cliente: Z - A" onClick={() => { fechar(); setSortOrder('NOME_DESC'); }} />
                    {separador}
                    <DropdownItem isDark={isDark} label="Status: vencidos primeiro" onClick={() => { fechar(); setSortOrder('STATUS_VENCIDO'); }} />
                    <DropdownItem isDark={isDark} label="Tipo: A1, A3, Nuvem" onClick={() => { fechar(); setSortOrder('TIPO'); }} />
                  </>
                )}
              </DropdownMenu>
            )}

            {user && user.role >= 1 && (
              <DropdownMenu title="Ações Rápidas" icon={Plus} isDark={isDark}>
                {(fechar: () => void) => (
                  <>
                    <DropdownItem isDark={isDark} icon={Plus} label="Novo Registro" onClick={() => { fechar(); setShowModal('manual'); }} highlight />
                    {separador}
                    <DropdownItem isDark={isDark} icon={FileDown} label="Gerar Relatório PDF" onClick={() => { fechar(); setShowModal('pdf'); }} />
                    <DropdownItem isDark={isDark} icon={FileSpreadsheet} label="Importar Planilha CSV" onClick={() => { fechar(); setShowModal('csv'); }} />
                  </>
                )}
              </DropdownMenu>
            )}
          </div>
        </div>

        <AnimatePresence>
          {notification && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-20 left-1/2 -translate-x-1/2 bg-emerald-800 text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-3 font-medium">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />{notification}
            </motion.div>
          )}
        </AnimatePresence>

        {viewMode === 'dashboard' && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div onClick={() => { setQuickFilter('ALL'); setViewMode('table'); }} className={`p-6 rounded-3xl border shadow-sm flex items-center gap-4 cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all ${themeCard}`} title="Clique para ver todos na tabela">
                <div className={`p-4 rounded-2xl ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'}`}><ShieldCheck className={`w-8 h-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} /></div>
                <div>
                  <p className={`text-xs uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Total Controlados</p>
                  <h3 className="text-3xl font-serif">{stats.total}</h3>
                  <span className="text-[11px] text-blue-500 font-semibold underline">Abrir tabela completa →</span>
                </div>
              </div>
              <div onClick={() => { setQuickFilter('PROXIMOS'); setViewMode('table'); }} className={`p-6 rounded-3xl border shadow-sm flex items-center gap-4 cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all border-amber-500/40 ${themeCard}`} title="Clique para ver certificados que vencem em 30 dias">
                <div className={`p-4 rounded-2xl ${isDark ? 'bg-yellow-900/30' : 'bg-yellow-50'}`}><AlertTriangle className={`w-8 h-8 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} /></div>
                <div>
                  <p className={`text-xs uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Vencem em 30 Dias</p>
                  <h3 className="text-3xl font-serif text-yellow-500 font-bold">{stats.expiring30Days}</h3>
                  <span className="text-[11px] text-amber-500 font-semibold underline">Filtrar na tabela →</span>
                </div>
              </div>
              <div onClick={() => { setQuickFilter('VENCIDOS'); setViewMode('table'); }} className={`p-6 rounded-3xl border shadow-sm flex items-center gap-4 cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all border-red-500/40 ${themeCard}`} title="Clique para ver certificados já vencidos">
                <div className={`p-4 rounded-2xl ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}><Trash2 className={`w-8 h-8 ${isDark ? 'text-red-400' : 'text-red-600'}`} /></div>
                <div>
                  <p className={`text-xs uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Já Vencidos</p>
                  <h3 className="text-3xl font-serif text-red-500 font-bold">{stats.expired}</h3>
                  <span className="text-[11px] text-red-500 font-semibold underline">Filtrar na tabela →</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className={`p-6 rounded-3xl border shadow-sm ${themeCard}`}>
                <h4 className={`text-sm uppercase tracking-widest font-bold mb-6 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Distribuição por Tipo</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((_entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#000' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className={`p-6 rounded-3xl border shadow-sm ${themeCard}`}>
                <div className="flex justify-between items-center mb-6">
                  <h4 className={`text-sm uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Vencimentos nos próximos 6 Meses</h4>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">(Clique na barra para abrir clientes)</span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <XAxis dataKey="name" stroke={isDark ? '#64748b' : '#a3a3a3'} fontSize={13} fontWeight="bold" tickLine={false} axisLine={false} />
                      <YAxis stroke={isDark ? '#64748b' : '#a3a3a3'} fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: isDark ? '#334155' : '#f5f5f5' }} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#000' }} />
                      <Bar dataKey="Vencimentos" fill="#10b981" radius={[6, 6, 0, 0]} className="cursor-pointer hover:opacity-80 transition-opacity" onClick={(data: any) => { if (data && data.name) { setQuickFilter('MONTH_' + data.name); setViewMode('table'); } }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {viewMode === 'table' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300 ${themeCard}`}>
            <div className="overflow-x-auto min-h-[50vh]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-neutral-50 border-neutral-200'}`}>
                    <th className={`px-4 py-4 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Cliente & Documento</th>
                    <th className={`px-4 py-4 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Contato & Responsável</th>
                    <th className={`px-4 py-4 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Vencimento / Renovação</th>
                    <th className={`px-4 py-4 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Status de Uso</th>
                    <th className={`px-4 py-4 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Senha Registrada</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCerts.map((cert) => {
                    const days = cert.expiry_date ? differenceInDays(startOfDay(parseISO(cert.expiry_date)), startOfDay(new Date())) : 0;
                    const status = getStatusInfo(days);
                    let mesVencimento = 'N/A';
                    if (cert.expiry_date) {
                      const mes = format(parseISO(cert.expiry_date), 'LLLL/yyyy', { locale: ptBR });
                      mesVencimento = mes.charAt(0).toUpperCase() + mes.slice(1);
                    }
                    return (
                      <tr key={cert.id} onClick={() => setDetailsCert(cert)} className={`cursor-pointer border-b last:border-b-0 transition-colors ${isDark ? 'border-slate-700/50' : 'border-neutral-100'} ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-neutral-50'}`}>
                        <td className="px-4 py-4">
                          <div className="font-bold text-sm text-emerald-600 whitespace-normal break-words max-w-xs hover:underline">{cert.client_name || 'Sem Nome'}</div>
                          <div className={`font-mono text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>{formatCpfCnpj(cert.doc_number || '')}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className={`text-xs font-medium max-w-[160px] truncate ${isDark ? 'text-slate-300' : 'text-neutral-700'}`} title={cert.email_cliente}>{cert.email_cliente || '-'}</div>
                          {cert.telefone && <div className={`text-xs font-mono mt-0.5 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>{cert.telefone}</div>}
                          {cert.responsavel && <div className="text-[10px] font-semibold text-blue-500 mt-0.5">Resp: {cert.responsavel}</div>}
                        </td>
                        <td className="px-4 py-4">
                          {days <= 30
                            ? <BotaoRenovar formattedDate={mesVencimento} days={days} isDark={isDark} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setRenewCert(cert); }} />
                            : <div className="text-sm font-semibold">{mesVencimento}</div>}
                          <div className={`text-[10px] font-bold mt-1 inline-block border px-1.5 rounded shadow-sm ${isDark ? 'bg-slate-800 border-slate-600 text-slate-300' : 'bg-white border-neutral-200 text-neutral-600'}`}>{cert.type || 'A1'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${status.color}`}>{status.text}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm w-16 truncate">{showPassword[cert.id] ? cert.password : '••••••••'}</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setShowPassword(p => ({ ...p, [cert.id]: !p[cert.id] })); }} className={`p-1.5 rounded-md transition-all cursor-pointer ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-neutral-500 hover:bg-neutral-200'}`}>
                              {showPassword[cert.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button type="button" onClick={(e) => handleCopyPassword(e, cert.id, cert.password || '')} className={`p-1.5 rounded-md transition-all cursor-pointer ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-neutral-500 hover:bg-neutral-200'}`} title="Copiar Senha">
                              {copiedId === cert.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCerts.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-10 text-neutral-500 font-medium">Nenhum certificado encontrado para este filtro.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </main>

      <AnimatePresence>
        {detailsCert && (
          <ClientDetailsModal
            isDark={isDark}
            cert={detailsCert}
            onClose={() => setDetailsCert(null)}
            onEdit={() => { setShowModal('edit'); setSelectedId(detailsCert.id); setDetailsCert(null); }}
            onRenew={() => { setRenewCert(detailsCert); setDetailsCert(null); }}
            onDelete={async () => {
              if (window.confirm('Excluir cliente definitivamente?')) { await api.deleteCertificate(token, detailsCert.id); notify('Excluído'); loadCertificates(); setDetailsCert(null); }
            }}
            onCopyPassword={(senha: string) => { copiarTexto(senha); notify('🔑 Senha copiada!'); }}
            token={token}
          />
        )}
        {renewCert && <RenewModal isDark={isDark} cert={renewCert} token={token} onClose={() => setRenewCert(null)} onSuccess={() => { setRenewCert(null); loadCertificates(); notify('🎉 Renovado com Sucesso!'); }} />}
        {showModal === 'manual' && <ManualForm isDark={isDark} user={user} onClose={() => setShowModal(null)} onSuccess={() => { setShowModal(null); loadCertificates(); notify('Salvo!'); }} token={token} certificates={certificates} />}
        {showModal === 'edit' && <EditForm isDark={isDark} cert={certificates.find(c => c.id === selectedId)!} onClose={() => setShowModal(null)} onSuccess={() => { setShowModal(null); loadCertificates(); notify('Alterado!'); }} token={token} />}
        {showModal === 'pdf' && <PDFModal isDark={isDark} onClose={() => setShowModal(null)} certificates={certificates} userEmail={user?.email || 'Usuário'} notify={notify} />}
        {showModal === 'configEmail' && <ConfigEmailModal isDark={isDark} onClose={() => setShowModal(null)} token={token} notify={notify} />}
        {showModal === 'users' && <UsersModal isDark={isDark} onClose={() => setShowModal(null)} token={token} />}
        {showModal === 'logs' && <LogsModal isDark={isDark} onClose={() => setShowModal(null)} token={token} />}
        {showModal === 'batch' && <BatchUpload isDark={isDark} onClose={() => setShowModal(null)} />}
        {showModal === 'csv' && <CSVUpload isDark={isDark} onClose={() => setShowModal(null)} token={token} notify={notify} reloadData={loadCertificates} />}
        {showModal === 'restore' && <RestoreModal isDark={isDark} onClose={() => setShowModal(null)} token={token} notify={notify} reloadData={loadCertificates} />}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// FICHA DO CLIENTE (abre ao clicar numa linha da tabela)
// ============================================================================
function ClientDetailsModal({ isDark, cert, onClose, onEdit, onRenew, onCopyPassword }: any) {
  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';
  const themeBox = isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-neutral-50 border-neutral-200';
  const vencimento = cert.expiry_date ? format(parseISO(cert.expiry_date), 'dd/MM/yyyy') : 'N/A';

  const mensagemWhatsApp = encodeURIComponent(`Olá, identificamos que o seu certificado digital da Extrema Contabilidade vencerá em breve (${vencimento}). Recomendamos providenciar a renovação o quanto antes.`);
  const linkWhatsApp = cert.telefone ? `https://wa.me/55${cert.telefone.replace(/\D/g, '')}?text=${mensagemWhatsApp}` : `https://wa.me/?text=${mensagemWhatsApp}`;

  const gerarFichaPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 110);
    doc.setFont('helvetica', 'bold');
    doc.text('EXTREMA Contabilidade', 14, 22);
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Ficha Cadastral do Certificado', 14, 32);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 38);

    const linhas = [
      ['ID', `#${cert.id}`],
      ['Razão Social / Cliente', cert.client_name || 'Sem Razão Social'],
      ['CPF / CNPJ', formatCpfCnpj(cert.doc_number || '')],
      ['Tipo de Certificado', cert.type || 'A1'],
      ['Vencimento', vencimento],
      ['Responsável', cert.responsavel || 'Não informado'],
      ['E-mail', cert.email_cliente || 'Não informado'],
      ['Telefone / WhatsApp', cert.telefone || 'Não informado'],
      ['Observações Internas', cert.observacoes || 'Nenhuma'],
    ];
    autoTable(doc, {
      body: linhas,
      startY: 44,
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 4, font: 'helvetica' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    });
    doc.save(`Ficha_${cert.client_name ? cert.client_name.replace(/\s+/g, '_') : 'Cliente'}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-2xl rounded-3xl p-8 shadow-2xl border flex flex-col max-h-[90vh] ${themeCard}`}>
        <div className="flex justify-between items-start mb-6 border-b pb-4 border-slate-200/20">
          <div>
            <h2 className="text-2xl font-serif font-bold text-emerald-600 leading-tight">{cert.client_name || 'Sem Razão Social'}</h2>
            <p className="font-mono text-sm opacity-60 mt-1">ID: #{cert.id} | DOC: {formatCpfCnpj(cert.doc_number || '')}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-500/20 rounded-full cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-2xl border ${themeBox}`}>
              <div className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1 flex items-center gap-1"><FileBadge className="w-3 h-3" /> Vencimento & Tipo</div>
              <div className="font-bold text-lg">{cert.expiry_date ? format(parseISO(cert.expiry_date), 'dd/MM/yyyy') : 'Indefinido'}</div>
              <div className="text-xs font-semibold mt-1 bg-emerald-600/20 text-emerald-600 inline-block px-2 py-0.5 rounded">{cert.type || 'A1'}</div>
            </div>
            <div className={`p-4 rounded-2xl border ${themeBox}`}>
              <div className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Senha Cadastrada</div>
              <div className="font-mono font-bold text-lg break-all">{cert.password || 'Nenhuma'}</div>
              <button type="button" onClick={() => onCopyPassword(cert.password || '')} className="text-xs font-bold text-blue-500 hover:underline mt-1 cursor-pointer">Copiar Senha</button>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-2">Contatos & Responsável</div>
            <div className={`p-4 rounded-2xl border flex flex-col gap-2 ${themeBox}`}>
              <div className="flex justify-between items-center text-sm"><span className="font-semibold">Responsável Interno:</span><span className="font-bold text-blue-500">{cert.responsavel || 'Não informado'}</span></div>
              <div className="flex justify-between items-center text-sm"><span className="font-semibold">E-mail:</span><span className="opacity-80">{cert.email_cliente || 'Não informado'}</span></div>
              <div className="flex justify-between items-center text-sm"><span className="font-semibold">Telefone/WhatsApp:</span><span className="opacity-80">{cert.telefone || 'Não informado'}</span></div>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-2">Observações Internas (Equipe)</div>
            <div className={`p-4 rounded-2xl border text-sm min-h-[80px] whitespace-pre-wrap ${isDark ? 'bg-slate-900/50 border-slate-700 text-slate-300' : 'bg-neutral-50 border-neutral-200 text-neutral-700'}`}>
              {cert.observacoes ? cert.observacoes : <span className="opacity-40 italic">Nenhuma observação cadastrada para este cliente. Edite para adicionar.</span>}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200/20 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href={linkWhatsApp} target="_blank" rel="noreferrer" className="p-2.5 bg-[#25D366] hover:bg-[#1DA851] text-white rounded-xl font-bold flex justify-center items-center gap-1.5 shadow transition-colors text-xs text-center">
            <MessageCircle className="w-4 h-4 shrink-0" /> WhatsApp
          </a>
          <button type="button" onClick={onRenew} className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex justify-center items-center gap-1.5 shadow transition-colors text-xs cursor-pointer">
            <RefreshCw className="w-4 h-4 shrink-0" /> Renovar
          </button>
          <button type="button" onClick={gerarFichaPDF} className={`p-2.5 border rounded-xl font-bold flex justify-center items-center gap-1.5 transition-colors text-xs cursor-pointer ${isDark ? 'border-slate-600 hover:bg-slate-700 text-white' : 'border-neutral-300 hover:bg-neutral-100 text-neutral-800'}`}>
            <FileDown className="w-4 h-4 shrink-0" /> PDF Ficha
          </button>
          <button type="button" onClick={onEdit} className={`p-2.5 border rounded-xl font-bold flex justify-center items-center gap-1.5 transition-colors text-xs cursor-pointer ${isDark ? 'border-slate-600 hover:bg-slate-700 text-white' : 'border-neutral-300 hover:bg-neutral-100 text-neutral-800'}`}>
            <Edit className="w-4 h-4 shrink-0" /> Editar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// RENOVAÇÃO: só troca o vencimento (o servidor mantém os outros dados do certificado)
// ============================================================================
function RenewModal({ cert, onClose, onSuccess, token, isDark }: any) {
  const hoje = new Date();
  const [dia, setDia] = useState(String(hoje.getDate()).padStart(2, '0'));
  const [mes, setMes] = useState(String(hoje.getMonth() + 1).padStart(2, '0'));
  const ano = calcularAnoVencimento(cert.type || 'A1');
  const [salvando, setSalvando] = useState(false);

  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200 border-t-emerald-500' : 'bg-white border-neutral-200 border-t-emerald-500';
  const themeInput = isDark ? 'bg-slate-900 border-slate-600 text-slate-200' : 'bg-neutral-50 border-neutral-200 text-neutral-900';

  const confirmar = async () => {
    if (!dia || !mes || parseInt(mes) > 12 || parseInt(mes) < 1 || parseInt(dia) > 31 || parseInt(dia) < 1) {
      return alert('Por favor, insira um dia e mês válidos.');
    }
    const novoVencimento = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    setSalvando(true);
    try {
      await api.editCertificate(token, cert.id, { expiry_date: novoVencimento, issue_date: format(hoje, 'yyyy-MM-dd') });
      onSuccess();
    } catch (err) {
      alert('Erro de comunicação com o servidor.');
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-sm rounded-3xl p-8 shadow-2xl border-t-8 text-center ${themeCard}`}>
        <CalendarClock className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold mb-1">Atualizar Certificado</h3>
        <p className={`text-xs mb-6 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Cliente: <span className="font-bold text-emerald-500">{cert.client_name}</span></p>

        <div className={`p-4 rounded-xl border mb-6 text-sm ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-neutral-50 border-neutral-200'}`}>
          Sugerimos a data de <b>hoje</b>.<br /><br />
          Como é um certificado <b>{cert.type || 'A1'}</b>, calculamos o vencimento para o ano de <b>{ano}</b>.
        </div>

        <div className="text-left">
          <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Novo Vencimento</label>
          <div className={`flex items-center gap-1 p-2 rounded-xl border focus-within:ring-2 focus-within:ring-emerald-500 ${themeInput}`}>
            <input type="text" maxLength={2} value={dia} onChange={e => setDia(e.target.value.replace(/\D/g, ''))} className="w-14 text-center bg-transparent outline-none font-mono text-xl" placeholder="DD" />
            <span className="opacity-50 text-xl">/</span>
            <input type="text" maxLength={2} value={mes} onChange={e => setMes(e.target.value.replace(/\D/g, ''))} className="w-14 text-center bg-transparent outline-none font-mono text-xl" placeholder="MM" />
            <span className="opacity-50 text-xl">/</span>
            <div className="flex-1 text-center font-bold text-emerald-600 bg-emerald-500/10 rounded-md py-1.5 font-mono text-xl cursor-default" title="Ano fixado pelo tipo">{ano}</div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button type="button" onClick={onClose} className={`flex-1 p-3 border rounded-xl font-bold text-sm transition-colors cursor-pointer ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-neutral-200 hover:bg-neutral-100'}`}>Cancelar</button>
          <button type="button" onClick={confirmar} disabled={salvando} className="flex-1 p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition-colors disabled:opacity-50 cursor-pointer">Confirmar Data</button>
        </div>
      </motion.div>
    </div>
  );
}

const TIPOS_CERTIFICADO = ['A1 - Arquivo', 'A2 - Cartão', 'A3 - Cartão', 'A3 - Token', 'Nuvem - BirdID', 'Nuvem - SafeID'];

function ManualForm({ onClose, onSuccess, token, certificates, isDark, user }: any) {
  const hoje = new Date();
  const [formData, setFormData] = useState({ client_name: '', doc_number: '', type: 'A1 - Arquivo', password: '', email_cliente: '', telefone: '', responsavel: '', observacoes: '' });
  const [dia, setDia] = useState(String(hoje.getDate()).padStart(2, '0'));
  const [mes, setMes] = useState(String(hoje.getMonth() + 1).padStart(2, '0'));
  const ano = calcularAnoVencimento(formData.type);

  // Leitura dos certificados plugados neste computador (AgenteTerminal na porta 8889)
  const [localCerts, setLocalCerts] = useState<any[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [showLocalDropdown, setShowLocalDropdown] = useState(false);

  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';
  const themeInput = isDark ? 'bg-slate-900 border-slate-600 text-slate-200' : 'bg-neutral-50 border-neutral-200 text-neutral-900';

  const handleFetchLocal = async () => {
    setLoadingLocal(true);
    try {
      const certs = await api.getLocalCerts(token);
      if (certs.length === 0) {
        alert('Nenhum certificado detectado no USB ou Computador.');
      } else {
        setLocalCerts(certs);
        setShowLocalDropdown(true);
      }
    } catch (e) {
      alert('Agente USB (Terminal) não detectado nesta máquina.');
    } finally {
      setLoadingLocal(false);
    }
  };

  const handleSelectLocalCert = (cert: any) => {
    let novoDia = dia;
    let novoMes = mes;
    if (cert.data_vencimento) {
      const partes = cert.data_vencimento.split('-');
      novoDia = partes[2].substring(0, 2);
      novoMes = partes[1];
    }
    setDia(novoDia);
    setMes(novoMes);
    setFormData({
      ...formData,
      client_name: cert.nome,
      doc_number: formatCpfCnpj(cert.cpf_cnpj),
      type: cert.cpf_cnpj.length > 11 ? 'A1 - Arquivo' : 'A3 - Cartão'
    });
    setShowLocalDropdown(false);
  };

  const handleSave = async () => {
    try {
      if (!dia || !mes || parseInt(mes) > 12 || parseInt(mes) < 1 || parseInt(dia) > 31 || parseInt(dia) < 1) {
        return alert('Por favor, insira um dia e mês válidos.');
      }
      const dados = { ...formData, expiry_date: `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`, issue_date: format(hoje, 'yyyy-MM-dd') };

      const docLimpo = formData.doc_number.replace(/\D/g, '');
      const certExistente = certificates.find((c: any) => (c.client_name && c.client_name.toLowerCase() === formData.client_name.toLowerCase() && formData.client_name.trim() !== '') || (docLimpo !== '' && (c.doc_number ? c.doc_number.replace(/\D/g, '') : '') === docLimpo));

      if (certExistente) {
        if (window.confirm(`⚠️ O cliente "${certExistente.client_name}" já existe!\n\nSubstituir os dados pelos novos?`)) {
          if (user && user.role < 2 && window.prompt('🔒 Digite a senha Admin:') !== 'extrema2026') return alert('Senha incorreta. Cancelado.');
          await api.editCertificate(token, certExistente.id, dados);
          onSuccess();
          return;
        } else if (!window.confirm('Criar DUPLICATA?')) return;
      }
      await api.addCertificate(token, dados);
      onSuccess();
    } catch (err) {
      alert('Erro ao Salvar.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-2xl my-auto rounded-3xl p-8 shadow-2xl border ${themeCard}`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-serif italic">Novo Certificado</h3>
          <div className="relative">
            <button type="button" onClick={handleFetchLocal} disabled={loadingLocal} className={`text-xs px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1 transition-colors cursor-pointer ${isDark ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              <Search className="w-3 h-3" />{loadingLocal ? 'Lendo PC...' : 'Ler Leitora/USB'}
            </button>
            <AnimatePresence>
              {showLocalDropdown && localCerts.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`absolute right-0 top-full mt-2 w-80 rounded-xl shadow-xl border overflow-hidden z-[60] flex flex-col ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-neutral-200'}`}>
                  <div className={`flex items-center justify-between p-2 border-b ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-neutral-100 border-neutral-200'}`}>
                    <span className={`text-[10px] font-bold uppercase ml-2 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Selecione o Certificado</span>
                    <button type="button" onClick={() => setShowLocalDropdown(false)} className={`p-1.5 rounded-md transition-colors cursor-pointer ${isDark ? 'hover:bg-slate-700' : 'hover:bg-neutral-200'}`}><X className="w-4 h-4" /></button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {localCerts.map((c, index) => (
                      <div key={index} onClick={() => handleSelectLocalCert(c)} className={`p-3 text-sm cursor-pointer border-b last:border-b-0 hover:bg-emerald-500/10 transition-colors ${isDark ? 'border-slate-700' : 'border-neutral-100'}`}>
                        <div className="font-bold truncate" title={c.nome}>{c.nome}</div>
                        <div className="text-xs flex justify-between mt-1 opacity-70"><span>{formatCpfCnpj(c.cpf_cnpj)}</span></div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">CNPJ / CPF</label>
            <input className={`w-full p-3 rounded-xl outline-none border font-mono ${themeInput}`} value={formData.doc_number} maxLength={18} onChange={e => setFormData({ ...formData, doc_number: formatCpfCnpj(e.target.value) })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Tipo</label>
            <select className={`w-full p-3 rounded-xl outline-none border text-sm ${themeInput}`} value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
              {TIPOS_CERTIFICADO.map(tipo => <option key={tipo}>{tipo}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Razão Social do Cliente</label>
            <input className={`w-full p-3 rounded-xl outline-none border ${themeInput}`} value={formData.client_name} onChange={e => setFormData({ ...formData, client_name: e.target.value })} required />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Vencimento Programado</label>
            <div className={`flex items-center gap-2 p-1 rounded-xl border focus-within:ring-2 focus-within:ring-emerald-500 ${themeInput}`}>
              <input type="text" maxLength={2} value={dia} onChange={e => setDia(e.target.value.replace(/\D/g, ''))} className="w-16 p-2 text-center bg-transparent outline-none font-mono" placeholder="DD" />
              <span className="opacity-50">/</span>
              <input type="text" maxLength={2} value={mes} onChange={e => setMes(e.target.value.replace(/\D/g, ''))} className="w-16 p-2 text-center bg-transparent outline-none font-mono" placeholder="MM" />
              <span className="opacity-50">/</span>
              <div className="w-20 p-2 text-center rounded-lg font-bold font-mono text-emerald-600 bg-emerald-500/10" title="Ano calculado automaticamente">{ano}</div>
              <span className="text-[10px] font-medium opacity-50 ml-2 italic hidden sm:block">Ano calculado via {formData.type.split('-')[0]}</span>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Senha</label>
            <input className={`w-full p-3 rounded-xl outline-none border font-mono ${themeInput}`} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">E-mail do Cliente</label>
            <input type="email" placeholder="contato@empresa.com" className={`w-full p-3 rounded-xl outline-none border ${themeInput}`} value={formData.email_cliente} onChange={e => setFormData({ ...formData, email_cliente: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">WhatsApp / Telefone</label>
            <input type="text" placeholder="(99) 99999-9999" className={`w-full p-3 rounded-xl outline-none border ${themeInput}`} value={formData.telefone} onChange={e => setFormData({ ...formData, telefone: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Responsável pelo Cliente</label>
            <input type="text" placeholder="Ex: Fulano" className={`w-full p-3 rounded-xl outline-none border ${themeInput}`} value={formData.responsavel} onChange={e => setFormData({ ...formData, responsavel: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Observações Internas</label>
            <textarea placeholder="Avisos, quem indicou, local do A3..." rows={2} className={`w-full p-3 rounded-xl outline-none border text-sm resize-none ${themeInput}`} value={formData.observacoes} onChange={e => setFormData({ ...formData, observacoes: e.target.value })} />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button type="button" onClick={onClose} className={`flex-1 p-3 border rounded-xl font-semibold cursor-pointer ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>Cancelar</button>
          <button type="button" onClick={handleSave} className="flex-1 p-3 bg-emerald-600 text-white rounded-xl font-bold shadow-md hover:bg-emerald-700 cursor-pointer">Salvar Registro</button>
        </div>
      </motion.div>
    </div>
  );
}

function EditForm({ cert, onClose, onSuccess, token, isDark }: any) {
  const [formData, setFormData] = useState({
    client_name: cert.client_name || '',
    doc_number: formatCpfCnpj(cert.doc_number || ''),
    type: cert.type || 'A1 - Arquivo',
    password: cert.password || '',
    email_cliente: cert.email_cliente || '',
    telefone: cert.telefone || '',
    responsavel: cert.responsavel || '',
    observacoes: cert.observacoes || '',
  });

  let diaInicial = '01';
  let mesInicial = '01';
  if (cert.expiry_date) {
    const partes = cert.expiry_date.split('T')[0].split('-');
    diaInicial = partes[2]?.substring(0, 2);
    mesInicial = partes[1];
  }
  const [dia, setDia] = useState(diaInicial);
  const [mes, setMes] = useState(mesInicial);
  const ano = calcularAnoVencimento(formData.type);

  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200 border-t-blue-500' : 'bg-white border-neutral-200 border-t-blue-500';
  const themeInput = isDark ? 'bg-slate-900 border-slate-600 text-slate-200' : 'bg-neutral-50 border-neutral-200 text-neutral-900';

  const handleSave = async () => {
    try {
      if (!dia || !mes || parseInt(mes) > 12 || parseInt(mes) < 1 || parseInt(dia) > 31 || parseInt(dia) < 1) {
        return alert('Por favor, insira um dia e mês válidos.');
      }
      await api.editCertificate(token, cert.id, { ...formData, expiry_date: `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}` });
      onSuccess();
    } catch (err) {
      alert('Erro ao Atualizar!');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-2xl my-auto rounded-3xl p-8 shadow-2xl border-t-8 ${themeCard}`}>
        <h3 className="text-xl font-serif italic mb-6">Alterar Certificado #{cert.id}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">CNPJ / CPF</label>
            <input className={`w-full p-3 rounded-xl outline-none border font-mono ${themeInput}`} value={formData.doc_number} maxLength={18} onChange={e => setFormData({ ...formData, doc_number: formatCpfCnpj(e.target.value) })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Tipo</label>
            <select className={`w-full p-3 rounded-xl outline-none border text-sm ${themeInput}`} value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
              {TIPOS_CERTIFICADO.map(tipo => <option key={tipo}>{tipo}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Razão Social do Cliente</label>
            <input className={`w-full p-3 rounded-xl outline-none border ${themeInput}`} value={formData.client_name} onChange={e => setFormData({ ...formData, client_name: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Vencimento Programado</label>
            <div className={`flex items-center gap-2 p-1 rounded-xl border focus-within:ring-2 focus-within:ring-blue-500 ${themeInput}`}>
              <input type="text" maxLength={2} value={dia} onChange={e => setDia(e.target.value.replace(/\D/g, ''))} className="w-16 p-2 text-center bg-transparent outline-none font-mono" placeholder="DD" />
              <span className="opacity-50">/</span>
              <input type="text" maxLength={2} value={mes} onChange={e => setMes(e.target.value.replace(/\D/g, ''))} className="w-16 p-2 text-center bg-transparent outline-none font-mono" placeholder="MM" />
              <span className="opacity-50">/</span>
              <div className="w-20 p-2 text-center rounded-lg font-bold font-mono text-blue-500 bg-blue-500/10">{ano}</div>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Senha</label>
            <input className={`w-full p-3 rounded-xl outline-none border font-mono ${themeInput}`} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">E-mail do Cliente</label>
            <input type="email" className={`w-full p-3 rounded-xl outline-none border ${themeInput}`} value={formData.email_cliente} onChange={e => setFormData({ ...formData, email_cliente: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">WhatsApp / Telefone</label>
            <input type="text" className={`w-full p-3 rounded-xl outline-none border ${themeInput}`} value={formData.telefone} onChange={e => setFormData({ ...formData, telefone: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Responsável pelo Cliente</label>
            <input type="text" className={`w-full p-3 rounded-xl outline-none border ${themeInput}`} value={formData.responsavel} onChange={e => setFormData({ ...formData, responsavel: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold mb-1 block opacity-70">Observações Internas</label>
            <textarea rows={2} className={`w-full p-3 rounded-xl outline-none border text-sm resize-none ${themeInput}`} value={formData.observacoes} onChange={e => setFormData({ ...formData, observacoes: e.target.value })} />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button type="button" onClick={onClose} className={`flex-1 p-3 border rounded-xl font-semibold cursor-pointer ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>Cancelar</button>
          <button type="button" onClick={handleSave} className="flex-1 p-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 cursor-pointer">Atualizar Registro</button>
        </div>
      </motion.div>
    </div>
  );
}

function PDFModal({ onClose, certificates, isDark, userEmail, notify }: any) {
  const [search, setSearch] = useState('');
  const [selectedCerts, setSelectedCerts] = useState<Certificate[]>([]);

  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';
  const themeInput = isDark ? 'bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500' : 'bg-neutral-50 border-neutral-200 text-neutral-900';

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const lowerSearch = search.toLowerCase();
    return certificates.filter((c: Certificate) => {
      const nomeSeguro = c.client_name ? c.client_name.toLowerCase() : '';
      const docSeguro = c.doc_number ? c.doc_number.toLowerCase() : '';
      return (nomeSeguro.includes(lowerSearch) || docSeguro.includes(lowerSearch)) && !selectedCerts.find(sc => sc.id === c.id);
    }).slice(0, 6);
  }, [search, certificates, selectedCerts]);

  const diasParaVencer = (c: Certificate) => differenceInDays(startOfDay(parseISO(c.expiry_date)), startOfDay(new Date()));

  const generatePDF = (data: Certificate[], title: string) => {
    if (data.length === 0) return alert('Nenhum certificado encontrado para este filtro.');

    const doc = new jsPDF('p', 'mm', 'a4');
    doc.setFontSize(22);
    doc.setTextColor(30, 30, 110);
    doc.setFont('helvetica', 'bold');
    doc.text('EXTREMA', 14, 25);
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38);
    doc.text('Contabilidade', 14, 30);
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Relatório - ${title}`, 14, 45);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Emitido por: ${userEmail}`, 14, 51);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(14, 54, 196, 54);

    const tableRows: any[] = [];
    [...data].sort((a, b) => {
      const timeA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
      const timeB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
      return timeA - timeB;
    }).forEach(cert => {
      const days = cert.expiry_date ? diasParaVencer(cert) : 0;
      tableRows.push([
        cert.id,
        cert.client_name || 'Sem Nome',
        formatCpfCnpj(cert.doc_number || ''),
        cert.type ? cert.type.split(' - ')[0] : '',
        cert.expiry_date ? format(parseISO(cert.expiry_date), 'dd/MM/yyyy') : '',
        days < 0 ? 'VENCIDO' : `${days} dias`,
      ]);
    });

    autoTable(doc, {
      head: [['ID', 'Cliente / Razão Social', 'CPF/CNPJ', 'Tipo', 'Vencimento', 'Situação']],
      body: tableRows,
      startY: 58,
      theme: 'plain',
      headStyles: { textColor: [15, 23, 42], fontStyle: 'bold', lineWidth: { bottom: 0.5 }, lineColor: [15, 23, 42] },
      bodyStyles: { textColor: [51, 65, 85], lineWidth: { bottom: 0.1 }, lineColor: [226, 232, 240] },
      styles: { fontSize: 8, cellPadding: 3, font: 'helvetica' },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 32 }, 3: { cellWidth: 12 }, 4: { cellWidth: 20 }, 5: { cellWidth: 20 } },
      didParseCell: function (dataInfo) {
        if (dataInfo.section === 'body' && dataInfo.column.index === 5 && dataInfo.cell.raw === 'VENCIDO') {
          dataInfo.cell.styles.textColor = [220, 38, 38];
          dataInfo.cell.styles.fontStyle = 'bold';
        }
      }
    });

    doc.save(`Relatorio_${title.replace(/\s+/g, '_')}_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    notify('📄 PDF gerado com sucesso!');
    onClose();
  };

  const handleSelect = (cert: Certificate) => {
    setSelectedCerts([...selectedCerts, cert]);
    setSearch('');
  };

  const handleRemove = (id: number) => {
    setSelectedCerts(selectedCerts.filter(c => c.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-3xl rounded-3xl p-8 shadow-2xl border ${themeCard}`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-serif italic flex items-center gap-2"><FileText className="w-6 h-6 text-emerald-500" /> Relatórios PDF</h3>
          <button type="button" onClick={onClose} className="text-sm underline opacity-50 hover:opacity-100 cursor-pointer">Fechar</button>
        </div>

        <div className={`p-5 rounded-2xl border mb-6 ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-neutral-50 border-neutral-200'}`}>
          <h4 className={`text-sm font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>1. Montar Relatório Personalizado</h4>
          <div className="relative mb-3">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-neutral-400'}`} />
            <input type="text" placeholder="Digite o nome ou CPF para buscar..." className={`w-full pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm border ${themeInput}`} value={search} onChange={e => setSearch(e.target.value)} />
            {suggestions.length > 0 && (
              <div className={`absolute top-full mt-1 w-full rounded-xl border shadow-xl z-20 overflow-hidden ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-neutral-200'}`}>
                {suggestions.map((c: Certificate) => (
                  <div key={c.id} onClick={() => handleSelect(c)} className={`px-4 py-2 text-sm cursor-pointer border-b last:border-b-0 flex justify-between ${isDark ? 'border-slate-700 hover:bg-slate-700' : 'border-neutral-100 hover:bg-emerald-50'}`}>
                    <span className="font-semibold">{c.client_name || 'Sem Nome'}</span>
                    <span className={`font-mono text-xs ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>{formatCpfCnpj(c.doc_number || '')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedCerts.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedCerts.map(c => (
                <div key={c.id} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDark ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                  {c.client_name || 'Sem Nome'}
                  <button type="button" onClick={() => handleRemove(c.id)} className="ml-1 hover:bg-emerald-200/50 rounded-full p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}

          <button type="button" disabled={selectedCerts.length === 0} onClick={() => generatePDF(selectedCerts, 'Personalizado')} className={`w-full p-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${selectedCerts.length > 0 ? 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700' : (isDark ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed')}`}>
            <FileDown className="w-4 h-4" /> Imprimir Relatório ({selectedCerts.length})
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <button type="button" onClick={() => generatePDF(certificates.filter((c: Certificate) => c.expiry_date && diasParaVencer(c) < 0), 'Apenas Vencidos')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 cursor-pointer ${isDark ? 'bg-red-900/20 border-red-900 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <AlertTriangle className="w-6 h-6" />
            <span className="font-bold text-sm text-center leading-tight">Apenas<br />Vencidos</span>
          </button>
          <button type="button" onClick={() => generatePDF(certificates.filter((c: Certificate) => { if (!c.expiry_date) return false; const dias = diasParaVencer(c); return dias >= 0 && dias <= 30; }), 'Vencem em 30 Dias')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 cursor-pointer ${isDark ? 'bg-yellow-900/20 border-yellow-900 text-yellow-400' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
            <CalendarClock className="w-6 h-6" />
            <span className="font-bold text-sm text-center leading-tight">Próximos<br />30 Dias</span>
          </button>
          <button type="button" onClick={() => generatePDF(certificates.filter((c: Certificate) => (c.expiry_date ? diasParaVencer(c) <= 30 : false)), 'Atenção (Vencidos + Próximos 30 Dias)')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 cursor-pointer ${isDark ? 'bg-orange-900/20 border-orange-900 text-orange-400' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
            <FileBadge className="w-6 h-6" />
            <span className="font-bold text-sm text-center leading-tight">Vencidos +<br />Próximos</span>
          </button>
          <button type="button" onClick={() => generatePDF(certificates, 'Geral Completo')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 cursor-pointer ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-neutral-100 border-neutral-200 text-neutral-700'}`}>
            <Database className="w-6 h-6" />
            <span className="font-bold text-sm text-center leading-tight">Geral<br />Completo</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// CONFIGURAÇÃO DO ROBÔ DE E-MAILS (ACEITA MÚLTIPLOS E-MAILS)
// ============================================================================
function ConfigEmailModal({ onClose, token, isDark, notify }: any) {
  const [formData, setFormData] = useState({ email_remetente: '', senha_app: '', modo_disparo: 'EQUIPE', email_equipe: '' });
  const [salvando, setSalvando] = useState(false);
  const [disparando, setDisparando] = useState(false);

  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';
  const themeInput = isDark ? 'bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500' : 'bg-neutral-50 border-neutral-200 text-neutral-900';

  useEffect(() => {
    api.getConfigEmail(token).then((data: any) => {
      if (data && Object.keys(data).length > 0) {
        setFormData({
          email_remetente: data.email_remetente || '',
          senha_app: data.senha_app || '',
          modo_disparo: data.modo_disparo || 'EQUIPE',
          email_equipe: data.email_equipe || ''
        });
      }
    }).catch(() => {});
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.saveConfigEmail(token, formData);
      notify('⚙️ Robô configurado com sucesso!');
      onClose();
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleDispararAgora = async () => {
    setDisparando(true);
    try {
      const res = await api.triggerEmailRobot(token);
      alert(res.message);
      notify('🚀 Robô disparado!');
    } catch (err: any) {
      alert('Erro ao disparar robô de e-mails: ' + err.message);
    } finally {
      setDisparando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-lg rounded-3xl p-8 shadow-2xl border-t-8 border-t-emerald-500 ${themeCard}`}>
        <h3 className="text-xl font-serif italic mb-2 flex items-center gap-2"><Mail className="w-6 h-6 text-emerald-500" /> Servidor de E-mails (Robô)</h3>
        <p className={`text-xs mb-6 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Configure as credenciais de envio e como o robô deve trabalhar diariamente às 08:30.</p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-bold block opacity-70 mb-1">Conta do Gmail (Remetente)</label>
            <input required type="email" placeholder="suporte@empresa.com" className={`w-full p-3 rounded-xl border ${themeInput}`} value={formData.email_remetente} onChange={e => setFormData({ ...formData, email_remetente: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold block opacity-70 mb-1">Senha de Aplicativo (16 letras do Google)</label>
            <input required type="password" placeholder="••••••••••••••••" className={`w-full p-3 rounded-xl border font-mono tracking-widest ${themeInput}`} value={formData.senha_app} onChange={e => setFormData({ ...formData, senha_app: e.target.value })} />
            <span className="text-[10px] text-neutral-500 mt-1 block">* Os espaços serão removidos automaticamente pelo sistema.</span>
          </div>
          <div className="pt-2 border-t border-dashed border-slate-300 dark:border-slate-700">
            <label className="text-[10px] uppercase font-bold block opacity-70 mb-1">Modo de Trabalho do Robô</label>
            <select className={`w-full p-3 rounded-xl border text-sm ${themeInput}`} value={formData.modo_disparo} onChange={e => setFormData({ ...formData, modo_disparo: e.target.value })}>
              <option value="EQUIPE">Alertar a Recepção/Equipe (Enviar Resumo Completo)</option>
              <option value="CLIENTE">Cobrar o Cliente Direto (Automação Individual)</option>
            </select>
          </div>

          <AnimatePresence>
            {formData.modo_disparo === 'EQUIPE' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <label className="text-[10px] uppercase font-bold block opacity-70 mb-1">E-mails Destinatários <span className="text-emerald-500">(Separe por vírgula)</span></label>
                <input required type="text" placeholder="recepcao@empresa.com, diretoria@empresa.com" className={`w-full p-3 rounded-xl border ${themeInput}`} value={formData.email_equipe} onChange={e => setFormData({ ...formData, email_equipe: e.target.value })} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-2">
            <button type="button" disabled={disparando} onClick={handleDispararAgora} className="w-full p-2.5 rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer">
              {disparando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Disparar Alertas de E-mail Imediatamente (Teste)
            </button>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={onClose} className={`flex-1 p-3 border rounded-xl font-bold cursor-pointer ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 p-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-md disabled:opacity-50 cursor-pointer">
              {salvando ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function UsersModal({ onClose, isDark, token }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [newLogin, setNewLogin] = useState('');
  const [newSenha, setNewSenha] = useState('');
  const [newNivel, setNewNivel] = useState('1');

  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';
  const themeInput = isDark ? 'bg-slate-900 border-slate-600 text-slate-200' : 'bg-neutral-50 border-neutral-200 text-neutral-900';

  useEffect(() => { loadUsers(); }, []);
  const loadUsers = async () => { try { setUsers(await api.getUsers(token)); } catch (err) {} };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.addUser(token, { login: newLogin, senha: newSenha, nivel: newNivel });
    setNewLogin('');
    setNewSenha('');
    loadUsers();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-3xl rounded-3xl p-8 shadow-2xl border ${themeCard} max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between mb-6">
          <h3 className="text-xl font-serif italic"><Users className="w-6 h-6 inline mr-2 text-emerald-500" /> Gestão de Acessos</h3>
          <button type="button" onClick={onClose} className="opacity-50 hover:opacity-100 cursor-pointer">Fechar</button>
        </div>
        <form onSubmit={handleAddUser} className={`p-4 rounded-2xl mb-6 border flex flex-col sm:flex-row gap-3 items-end ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-neutral-50 border-neutral-200'}`}>
          <div className="flex-1 w-full">
            <label className="text-[10px] uppercase font-bold opacity-70">Usuário</label>
            <input required className={`w-full p-2.5 rounded-lg border ${themeInput}`} value={newLogin} onChange={e => setNewLogin(e.target.value)} />
          </div>
          <div className="flex-1 w-full">
            <label className="text-[10px] uppercase font-bold opacity-70">Senha</label>
            <input required type="password" className={`w-full p-2.5 rounded-lg border ${themeInput}`} value={newSenha} onChange={e => setNewSenha(e.target.value)} />
          </div>
          <div className="flex-1 w-full">
            <label className="text-[10px] uppercase font-bold opacity-70">Nível</label>
            <select className={`w-full p-2.5 rounded-lg border ${themeInput}`} value={newNivel} onChange={e => setNewNivel(e.target.value)}>
              <option value="0">Visitante</option>
              <option value="1">Operador</option>
              <option value="2">Administrador</option>
            </select>
          </div>
          <button type="submit" className="p-2.5 bg-emerald-600 text-white rounded-lg font-bold cursor-pointer">Add</button>
        </form>
        <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-neutral-200'}`}>
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className={isDark ? 'bg-slate-900/80 text-slate-400' : 'bg-neutral-100 text-neutral-500'}>
              <tr><th className="p-3">Login</th><th className="p-3">Nível</th><th className="p-3 text-right">Ação</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-slate-700/50">
                  <td className="p-3 font-medium">{u.login}</td>
                  <td className="p-3">{u.nivel === 2 ? 'Admin' : u.nivel === 1 ? 'Operador' : 'Visitante'}</td>
                  <td className="p-3 text-right">
                    {u.id !== 1 && (
                      <button type="button" onClick={async () => { if (window.confirm('Remover?')) { await api.deleteUser(token, u.id); loadUsers(); } }} className="text-red-500 hover:text-red-700 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

function LogsModal({ onClose, isDark, token }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => { api.getLogs(token).then(setLogs).catch(() => {}); }, [token]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-4xl rounded-3xl p-8 shadow-2xl border flex flex-col h-[85vh] ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200'}`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-serif italic">Registro de Atividades (Logs)</h3>
          <button type="button" onClick={onClose} className="opacity-50 hover:opacity-100 cursor-pointer">Fechar</button>
        </div>
        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900">
              <tr><th className="p-3">Data</th><th className="p-3">Usuário</th><th className="p-3">Ação</th></tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3 font-mono text-xs">{log.data_hora}</td>
                  <td className="p-3 font-bold text-blue-500">{log.usuario}</td>
                  <td className="p-3">{log.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

function BatchUpload({ onClose, isDark }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className={`w-full max-w-md rounded-3xl p-8 text-center border ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-neutral-800'}`}>
        <h3 className="text-xl font-bold mb-4">Importação de Pastas</h3>
        <p className="text-sm mb-6">O Crawler Java deve ser ativado diretamente no servidor.</p>
        <button type="button" onClick={onClose} className="w-full p-3 bg-neutral-200 text-neutral-800 dark:bg-slate-700 dark:text-white rounded-xl font-bold cursor-pointer">Fechar</button>
      </motion.div>
    </div>
  );
}

function CSVUpload({ onClose, isDark, token, notify, reloadData }: any) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className={`w-full max-w-md rounded-3xl p-8 text-center border ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-neutral-800'}`}>
        <h3 className="text-xl font-bold mb-4">Importar CSV</h3>
        <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} className="my-4 w-full" />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 p-2 bg-gray-200 rounded text-black font-bold cursor-pointer">Cancelar</button>
          <button type="button" onClick={async () => { if (file) { await api.importCSV(token, file); notify('Importado'); reloadData(); onClose(); } }} className="flex-1 p-2 bg-emerald-600 rounded text-white font-bold cursor-pointer">Enviar</button>
        </div>
      </motion.div>
    </div>
  );
}

function RestoreModal({ onClose, isDark, token, notify, reloadData }: any) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className={`w-full max-w-md rounded-3xl p-8 text-center border-t-8 border-red-500 ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-neutral-800'}`}>
        <Database className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <h3 className="text-xl font-bold mb-4">Restaurar Banco (.sql)</h3>
        <input type="file" accept=".sql" onChange={e => setFile(e.target.files?.[0] || null)} className="my-4 w-full" />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 p-2 bg-gray-200 rounded text-black font-bold cursor-pointer">Cancelar</button>
          <button type="button" onClick={async () => { if (file) { await api.restoreBackup(token, file); notify('Restaurado!'); reloadData(); onClose(); } }} className="flex-1 p-2 bg-red-600 rounded text-white font-bold cursor-pointer">Substituir Banco</button>
        </div>
      </motion.div>
    </div>
  );
}
