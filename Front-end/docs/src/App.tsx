import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, UploadCloud, Trash2, Eye, EyeOff, Search, Plus, LogOut,
  AlertTriangle, CheckCircle2, Settings, ChevronDown, FileSpreadsheet, 
  Database, History, Users, Edit, Filter, FolderUp, Trash, 
  Copy, Check, Moon, Sun, BarChart2, TableProperties, FileDown, FileText, X, Mail
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

export default function App() {
  const [token, setToken] = useState<string | null>(sessionStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(JSON.parse(sessionStorage.getItem('user') || 'null'));
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [isDark, setIsDark] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [viewMode, setViewMode] = useState<'table' | 'dashboard'>('table');

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('VENCIMENTO_ASC'); 
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
      setSelectedId(null);
    } finally { setLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.login(email, password);
      setToken(res.token); 
      setUser(res.user);
      
      localStorage.setItem('usuarioCertiManager', email); 
      sessionStorage.setItem('token', res.token); 
      sessionStorage.setItem('user', JSON.stringify(res.user));
    } catch (err) { alert('Credenciais inválidas'); }
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
    e.stopPropagation(); navigator.clipboard.writeText(pass); setCopiedId(id); notify('🔑 Senha copiada com sucesso!'); setTimeout(() => setCopiedId(null), 2000); 
  };

  const filteredCerts = useMemo(() => {
    let result = certificates.filter(c => {
      const nomeSeguro = c.client_name ? c.client_name.toLowerCase() : '';
      const docSeguro = c.doc_number ? c.doc_number.toLowerCase() : '';
      return nomeSeguro.includes(searchTerm.toLowerCase()) || docSeguro.includes(searchTerm.toLowerCase());
    });
    
    return result.sort((a, b) => {
      const nomeA = a.client_name || '';
      const nomeB = b.client_name || '';
      
      if (sortOrder === 'NOME_ASC') return nomeA.localeCompare(nomeB);
      if (sortOrder === 'NOME_DESC') return nomeB.localeCompare(nomeA);
      
      const dataA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0; 
      const dataB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
      
      if (sortOrder === 'VENCIMENTO_ASC') return dataA - dataB; 
      if (sortOrder === 'VENCIMENTO_DESC') return dataB - dataA; 
      return 0;
    });
  }, [certificates, searchTerm, sortOrder]);

  const stats = useMemo(() => {
    let expired = 0; let expiring30Days = 0; const hoje = startOfDay(new Date());
    certificates.forEach(c => {
      if(c.expiry_date) {
        // Correção de numeração da data
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
        if(!c.expiry_date) return false;
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
  const themeHeader = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-neutral-200';
  const themeInput = isDark ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-neutral-50 border-neutral-200 text-neutral-900';
  
  const getStatusColor = (expiryDate: string) => {
    if(!expiryDate) return isDark ? 'bg-slate-800 text-slate-500' : 'bg-neutral-100 text-neutral-500';
    // Correção de numeração da data
    const days = differenceInDays(startOfDay(parseISO(expiryDate)), startOfDay(new Date()));
    if (days < 0) return isDark ? 'bg-red-900/30 text-red-400 border-red-800' : 'bg-red-100 text-red-800 border-red-200';
    if (days <= 7) return isDark ? 'bg-yellow-900/30 text-yellow-400 border-yellow-800' : 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return isDark ? 'bg-emerald-900/20 text-emerald-400 border-emerald-800/50' : 'bg-emerald-50 text-emerald-800 border-emerald-100';
  };

  const getRowClass = (days: number, isSelected: boolean) => {
    if (isSelected) return isDark ? 'bg-emerald-900/40' : 'bg-emerald-50/50';
    if (days < 0) return isDark ? 'bg-red-900/10 hover:bg-red-900/20' : 'bg-red-50/30 hover:bg-red-50/50';
    if (days <= 7) return isDark ? 'bg-yellow-900/10 hover:bg-yellow-900/20' : 'bg-yellow-50/30 hover:bg-yellow-50/50';
    return isDark ? 'hover:bg-slate-700/50' : 'hover:bg-neutral-50';
  };

  if (!token) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${themeBg} ${themeText}`}>
        <div className="absolute top-6 right-6">
          <button onClick={() => setIsDark(!isDark)} className={`p-3 rounded-full ${themeCard} hover:ring-2 ring-emerald-500 transition-all`}>
            {isDark ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`p-8 rounded-3xl shadow-xl w-full max-w-md border transition-colors duration-300 ${themeCard}`}>
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
            <button className="w-full bg-emerald-600 text-white p-4 rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-lg">Entrar no Sistema</button>
          </form>
        </motion.div>
      </div>
    );
  }

  const DropdownMenu = ({ title, icon: Icon, children }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div className="relative">
        <button onClick={() => setIsOpen(!isOpen)} onBlur={() => setTimeout(() => setIsOpen(false), 200)} className={`flex items-center gap-2 border px-4 py-2 rounded-full transition-all font-medium text-sm shadow-sm ${isDark ? 'bg-slate-800 border-slate-600 hover:border-emerald-500 hover:text-emerald-400' : 'bg-white border-neutral-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700'}`}>
          {Icon && <Icon className="w-4 h-4" />} {title} <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className={`absolute right-0 mt-2 w-64 border rounded-2xl shadow-xl z-50 overflow-hidden py-2 ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-neutral-100'}`}>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const SystemMenu = ({ children }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div className="relative">
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          onBlur={() => setTimeout(() => setIsOpen(false), 200)} 
          className={`p-2 rounded-full transition-colors flex items-center justify-center shadow-sm border ${isDark ? 'bg-slate-700 border-slate-600 text-emerald-400 hover:bg-slate-600 hover:border-emerald-500' : 'bg-white border-neutral-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300'}`}
          title="Configurações do Sistema"
        >
          <Settings className={`w-5 h-5 transition-transform duration-500 ${isOpen ? 'rotate-90' : ''}`} />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.3, borderRadius: '100%', originX: 1, originY: 0 }} 
              animate={{ opacity: 1, scale: 1, borderRadius: '16px' }} 
              exit={{ opacity: 0, scale: 0.3, borderRadius: '100%' }} 
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`absolute right-0 mt-4 w-64 border shadow-2xl z-[100] overflow-hidden py-2 ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-neutral-100'}`}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const DropdownItem = ({ icon: Icon, label, onClick, danger = false, highlight = false }: any) => (
    <button onClick={onClick} className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${danger ? (isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-600 hover:bg-red-50') : highlight ? (isDark ? 'text-emerald-400 hover:bg-emerald-900/30 font-semibold' : 'text-emerald-600 hover:bg-emerald-50 font-semibold') : (isDark ? 'text-slate-300 hover:bg-slate-700 hover:text-emerald-400' : 'text-neutral-700 hover:bg-emerald-50 hover:text-emerald-700')}`}>
      {Icon && <Icon className="w-4 h-4" />} {label}
    </button>
  );

  const sortTitle = { 'NOME_ASC': 'Nome (A - Z)', 'NOME_DESC': 'Nome (Z - A)', 'VENCIMENTO_ASC': 'Data: Mais Antigos', 'VENCIMENTO_DESC': 'Data: Mais Recentes' }[sortOrder as keyof typeof sortTitle];

  return (
    <div className={`min-h-screen font-sans pb-20 transition-colors duration-300 ${themeBg} ${themeText}`}>
      
      <header className={`border-b px-6 py-4 flex items-center justify-between sticky top-0 z-40 transition-colors duration-300 ${themeHeader}`}>
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-lg"><ShieldCheck className="text-white w-5 h-5" /></div>
          <h1 className="text-xl font-serif italic font-medium">CertiManager</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button onClick={() => setIsDark(!isDark)} className={`p-2 rounded-full transition-colors border shadow-sm ${isDark ? 'bg-slate-700 text-yellow-400 border-slate-600 hover:bg-slate-600' : 'bg-white text-slate-600 border-neutral-200 hover:bg-neutral-50'}`}>
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          
          {user && user.role >= 2 && (
            <SystemMenu>
              <DropdownItem icon={Mail} label="Configurar Robô de E-mails" highlight onClick={() => setShowModal('configEmail')} />
              <div className={`h-px my-1 mx-2 ${isDark ? 'bg-slate-700' : 'bg-neutral-100'}`}></div>
              <DropdownItem icon={Users} label="Usuários do Sistema" onClick={() => setShowModal('users')} />
              <DropdownItem icon={Database} label="Backup do Banco" onClick={async () => { await api.triggerBackup(token!); notify('Backup realizado!'); }} />
              <DropdownItem icon={Database} label="Restaurar de um Backup (.sql)" danger onClick={() => setShowModal('restore')} />
              <div className={`h-px my-1 mx-2 ${isDark ? 'bg-slate-700' : 'bg-neutral-100'}`}></div>
              <DropdownItem icon={FolderUp} label="Importar de Pastas" onClick={() => setShowModal('batch')} />
              <DropdownItem icon={FileSpreadsheet} label="Importar CSV" onClick={() => setShowModal('csv')} />
              <div className={`h-px my-1 mx-2 ${isDark ? 'bg-slate-700' : 'bg-neutral-100'}`}></div>
              <DropdownItem icon={History} label="Auditoria (Logs)" onClick={() => setShowModal('logs')} />
              <DropdownItem icon={Trash} label="Faxina de Vencidos" danger onClick={async () => {
                if(confirm('Limpar duplicatas vencidas?')) { const res = await api.runGarbageCollector(token!); notify(res.message); loadCertificates(); }
              }} />
            </SystemMenu>
          )}

          <div className={`text-right hidden sm:block border-l pl-4 ${isDark ? 'border-slate-700' : 'border-neutral-200'}`}>
            <p className="text-sm font-medium uppercase">{user?.email}</p>
            <p className={`text-[10px] uppercase tracking-tighter ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Nível {user?.role}</p>
          </div>
          <button onClick={handleLogout} className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-600'}`}><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        
        <div className={`sticky top-[85px] z-30 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 p-4 rounded-2xl border shadow-md transition-all duration-300 backdrop-blur-xl ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white/80 border-neutral-200'}`}>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-neutral-400'}`} />
              <input type="text" placeholder="Buscar cliente ou documento..." className={`pl-10 pr-4 py-2 rounded-full w-64 focus:ring-2 focus:ring-emerald-500 outline-none text-sm border transition-colors ${themeInput}`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className={`flex items-center p-1 rounded-full border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-neutral-100 border-neutral-200'}`}>
              <button onClick={() => setViewMode('table')} className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all ${viewMode === 'table' ? 'bg-white text-emerald-600 shadow-sm' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-neutral-500 hover:text-neutral-700')}`}>
                <TableProperties className="w-4 h-4" /> Tabela
              </button>
              <button onClick={() => setViewMode('dashboard')} className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all ${viewMode === 'dashboard' ? 'bg-emerald-600 text-white shadow-sm' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-neutral-500 hover:text-neutral-700')}`}>
                <BarChart2 className="w-4 h-4" /> Resumo
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {viewMode === 'table' && (
              <DropdownMenu title={`Ordenar: ${sortTitle}`} icon={Filter}>
                <DropdownItem label="Vencimento: Mais Antigas" onClick={() => setSortOrder('VENCIMENTO_ASC')} />
                <DropdownItem label="Vencimento: Mais Recentes" onClick={() => setSortOrder('VENCIMENTO_DESC')} />
                <div className={`h-px my-1 mx-2 ${isDark ? 'bg-slate-700' : 'bg-neutral-100'}`}></div>
                <DropdownItem label="Nome (A - Z)" onClick={() => setSortOrder('NOME_ASC')} />
                <DropdownItem label="Nome (Z - A)" onClick={() => setSortOrder('NOME_DESC')} />
              </DropdownMenu>
            )}

            {user && user.role >= 1 && (
              <DropdownMenu title="Ações" icon={Plus}>
                <DropdownItem icon={Plus} label="Novo Registro" onClick={() => setShowModal('manual')} />
                {viewMode === 'table' && user.role >= 2 && <DropdownItem icon={Edit} label="Editar Selecionado" onClick={() => selectedId ? setShowModal('edit') : alert('Selecione um certificado na tabela primeiro!')} />} 
                
                <div className={`h-px my-1 mx-2 ${isDark ? 'bg-slate-700' : 'bg-neutral-100'}`}></div>
                <DropdownItem icon={FileDown} label="Gerar Relatório PDF" onClick={() => setShowModal('pdf')} highlight={true} />
                
                {user.role >= 2 && (
                  <>
                    <div className={`h-px my-1 mx-2 ${isDark ? 'bg-slate-700' : 'bg-neutral-100'}`}></div>
                    <DropdownItem icon={Trash2} label="Excluir Selecionado" danger onClick={async () => {
                      if(!selectedId) return alert('Selecione um certificado na tabela primeiro!');
                      if(confirm('Excluir este certificado definitivamente?')) { await api.deleteCertificate(token!, selectedId); notify('Excluído com sucesso!'); loadCertificates(); }
                    }} />
                  </>
                )}
              </DropdownMenu>
            )}
          </div>
        </div>

        <AnimatePresence>
          {notification && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-20 left-1/2 -translate-x-1/2 bg-emerald-800 text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />{notification}
            </motion.div>
          )}
        </AnimatePresence>

        {viewMode === 'dashboard' && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`p-6 rounded-3xl border shadow-sm flex items-center gap-4 ${themeCard}`}><div className={`p-4 rounded-2xl ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'}`}><ShieldCheck className={`w-8 h-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} /></div><div><p className={`text-xs uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Total Controlados</p><h3 className="text-3xl font-serif">{stats.total}</h3></div></div>
              <div className={`p-6 rounded-3xl border shadow-sm flex items-center gap-4 ${themeCard}`}><div className={`p-4 rounded-2xl ${isDark ? 'bg-yellow-900/30' : 'bg-yellow-50'}`}><AlertTriangle className={`w-8 h-8 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} /></div><div><p className={`text-xs uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Vencem em 30 Dias</p><h3 className="text-3xl font-serif text-yellow-500 font-bold">{stats.expiring30Days}</h3></div></div>
              <div className={`p-6 rounded-3xl border shadow-sm flex items-center gap-4 ${themeCard}`}><div className={`p-4 rounded-2xl ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}><Trash2 className={`w-8 h-8 ${isDark ? 'text-red-400' : 'text-red-600'}`} /></div><div><p className={`text-xs uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Já Vencidos</p><h3 className="text-3xl font-serif text-red-500 font-bold">{stats.expired}</h3></div></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className={`p-6 rounded-3xl border shadow-sm ${themeCard}`}><h4 className={`text-sm uppercase tracking-widest font-bold mb-6 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Distribuição por Tipo</h4><div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#000' }} /></PieChart></ResponsiveContainer></div></div>
              <div className={`p-6 rounded-3xl border shadow-sm ${themeCard}`}><h4 className={`text-sm uppercase tracking-widest font-bold mb-6 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Vencimentos nos próximos 6 Meses</h4><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={barData}><XAxis dataKey="name" stroke={isDark ? '#64748b' : '#a3a3a3'} fontSize={12} tickLine={false} axisLine={false} /><YAxis stroke={isDark ? '#64748b' : '#a3a3a3'} fontSize={12} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: isDark ? '#334155' : '#f5f5f5' }} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#000' }} /><Bar dataKey="Vencimentos" fill="#10b981" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
            </div>
          </motion.div>
        )}

        {viewMode === 'table' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300 ${themeCard}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-neutral-50 border-neutral-200'}`}>
                    <th className="px-3 py-3 w-10"></th>
                    <th className={`px-3 py-3 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>ID</th>
                    <th className={`px-3 py-3 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Cliente</th>
                    <th className={`px-3 py-3 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>CPF/CNPJ</th>
                    <th className={`px-3 py-3 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>E-mail</th>
                    <th className={`px-3 py-3 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Vencimento</th>
                    <th className={`px-3 py-3 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Status</th>
                    <th className={`px-3 py-3 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Tipo</th>
                    <th className={`px-3 py-3 text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Senha</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCerts.map((cert) => {
                    // Correção de numeração da data na Tabela
                    const days = cert.expiry_date ? differenceInDays(startOfDay(parseISO(cert.expiry_date)), startOfDay(new Date())) : 0;
                    const isSelected = selectedId === cert.id;
                    return (
                      <tr key={cert.id} onClick={() => setSelectedId(cert.id)} className={`border-b cursor-pointer transition-colors ${isDark ? 'border-slate-700/50' : 'border-neutral-100'} ${getRowClass(days, isSelected)}`}>
                        <td className="px-3 py-3"><div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-emerald-500' : (isDark ? 'border-slate-600' : 'border-neutral-300')}`}>{isSelected && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}</div></td>
                        <td className={`px-3 py-3 font-mono text-xs ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>#{cert.id}</td>
                        <td className="px-3 py-3 font-medium text-sm max-w-[160px] truncate" title={cert.client_name}>{cert.client_name || 'Sem Nome'}</td>
                        <td className={`px-3 py-3 text-sm font-mono ${isDark ? 'text-slate-400' : 'text-neutral-600'}`}>{formatCpfCnpj(cert.doc_number || '')}</td>
                        <td className={`px-3 py-3 text-xs font-medium max-w-[140px] truncate ${isDark ? 'text-slate-400' : 'text-neutral-500'}`} title={cert.email_cliente || ''}>
                          {cert.email_cliente ? cert.email_cliente : <span className="opacity-50">-</span>}
                        </td>
                        <td className="px-3 py-3 text-sm"><span className={`px-2 py-1 rounded-md border text-xs font-semibold transition-colors ${getStatusColor(cert.expiry_date)}`}>{cert.expiry_date ? format(parseISO(cert.expiry_date), 'dd/MM/yyyy') : 'N/A'}</span></td>
                        <td className="px-3 py-3 text-sm font-semibold">{days < 0 ? <span className="text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Vencido</span> : `${days} dias`}</td>
                        <td className="px-3 py-3"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded shadow-sm transition-colors ${isDark ? 'bg-slate-800 border-slate-600 text-slate-300' : 'bg-white border-neutral-200 text-neutral-600'}`}>{cert.type || 'A1'}</span></td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm mr-2 w-16 truncate">{showPassword[cert.id] ? cert.password : '••••••••'}</span>
                            <button onClick={(e) => { e.stopPropagation(); setShowPassword(p => ({ ...p, [cert.id]: !p[cert.id] })); }} className={`p-1.5 rounded-md transition-all ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-neutral-500 hover:bg-neutral-200'}`} title={showPassword[cert.id] ? "Ocultar" : "Mostrar"}>
                              {showPassword[cert.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button onClick={(e) => handleCopyPassword(e, cert.id, cert.password || '')} className={`p-1.5 rounded-md transition-all ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-neutral-500 hover:bg-neutral-200'}`} title="Copiar Senha">
                              {copiedId === cert.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </main>

      <AnimatePresence>
        {showModal === 'manual' && <ManualForm isDark={isDark} user={user} onClose={() => setShowModal(null)} onSuccess={() => { setShowModal(null); loadCertificates(); notify('Operação concluída com sucesso!'); }} token={token!} certificates={certificates} />}
        {showModal === 'edit' && <EditForm isDark={isDark} cert={certificates.find(c => c.id === selectedId)!} onClose={() => setShowModal(null)} onSuccess={() => { setShowModal(null); loadCertificates(); notify('Alterado com sucesso!'); }} token={token!} />}
        {showModal === 'pdf' && <PDFModal isDark={isDark} onClose={() => setShowModal(null)} certificates={certificates} userEmail={user?.email || 'Usuário'} notify={notify} />}
        {showModal === 'configEmail' && <ConfigEmailModal isDark={isDark} onClose={() => setShowModal(null)} token={token!} notify={notify} />}
        {showModal === 'users' && <UsersModal isDark={isDark} onClose={() => setShowModal(null)} token={token!} />}
        {showModal === 'logs' && <LogsModal isDark={isDark} onClose={() => setShowModal(null)} token={token!} />}
        {showModal === 'batch' && <BatchUpload isDark={isDark} onClose={() => setShowModal(null)} />}
        {showModal === 'csv' && <CSVUpload isDark={isDark} onClose={() => setShowModal(null)} token={token!} notify={notify} reloadData={loadCertificates} />}
        {showModal === 'restore' && <RestoreModal isDark={isDark} onClose={() => setShowModal(null)} token={token!} notify={notify} reloadData={loadCertificates} />}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// NOVO MODAL: CONFIGURAÇÃO DO ROBÔ DE E-MAILS (ACEITA MÚLTIPLOS E-MAILS)
// ============================================================================
function ConfigEmailModal({ onClose, token, isDark, notify }: any) {
  const [formData, setFormData] = useState({ email_remetente: '', senha_app: '', modo_disparo: 'EQUIPE', email_equipe: '' });
  const [salvando, setSalvando] = useState(false);

  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';
  const themeInput = isDark ? 'bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500' : 'bg-neutral-50 border-neutral-200 text-neutral-900';

  useEffect(() => {
    api.getConfigEmail(token).then((data: any) => {
      if(data && Object.keys(data).length > 0) {
        setFormData({
          email_remetente: data.email_remetente || '',
          senha_app: data.senha_app || '',
          modo_disparo: data.modo_disparo || 'EQUIPE',
          email_equipe: data.email_equipe || ''
        });
      }
    }).catch(() => console.error("Erro ao carregar configurações de email."));
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.saveConfigEmail(token, formData);
      notify('⚙️ Robô configurado com sucesso!');
      onClose();
    } catch (err) {
      alert("Erro ao salvar. Verifique se a tabela foi criada no banco de dados.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-lg rounded-3xl p-8 shadow-2xl border border-t-8 border-t-emerald-500 ${themeCard}`}>
        <h3 className="text-xl font-serif italic mb-2 flex items-center gap-2">
          <Mail className="w-6 h-6 text-emerald-500" /> Servidor de E-mails (Robô)
        </h3>
        <p className={`text-xs mb-6 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>
          Configure as credenciais de envio e como o robô deve trabalhar diariamente.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Conta do Gmail (Remetente)</label>
            <input required type="email" placeholder="ex: suporte@gmail.com" className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border ${themeInput}`} value={formData.email_remetente} onChange={e => setFormData({ ...formData, email_remetente: e.target.value })} />
          </div>

          <div>
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Senha de Aplicativo (16 letras)</label>
            <input required type="password" placeholder="••••••••••••••••" className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-widest border ${themeInput}`} value={formData.senha_app} onChange={e => setFormData({ ...formData, senha_app: e.target.value })} />
          </div>

          <div className="pt-4 border-t border-dashed border-slate-300">
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Modo de Trabalho do Robô</label>
            <select className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm border ${themeInput}`} value={formData.modo_disparo} onChange={e => setFormData({ ...formData, modo_disparo: e.target.value })}>
              <option value="EQUIPE">Alertar a Recepção/Equipe (Enviar Resumo)</option>
              <option value="CLIENTE">Cobrar o Cliente Direto (Automação Total)</option>
            </select>
          </div>

          <AnimatePresence>
            {formData.modo_disparo === 'EQUIPE' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>
                  E-mails Destinatários <span className="text-emerald-500">(Separe por vírgula)</span>
                </label>
                <input required type="text" placeholder="recepcao@empresa.com, diretoria@empresa.com" className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border ${themeInput}`} value={formData.email_equipe} onChange={e => setFormData({ ...formData, email_equipe: e.target.value })} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 mt-8 pt-4">
            <button type="button" onClick={onClose} className={`flex-1 p-3 border rounded-xl transition-colors font-semibold ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 p-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-md disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </div>
        </form>
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
      
      return (nomeSeguro.includes(lowerSearch) || docSeguro.includes(lowerSearch)) &&
             !selectedCerts.find(sc => sc.id === c.id);
    }).slice(0, 6); 
  }, [search, certificates, selectedCerts]);

  const generatePDF = (data: Certificate[], title: string) => {
    if(data.length === 0) return alert("Nenhum certificado encontrado para este filtro.");

    const doc = new jsPDF('landscape');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); 
    doc.text(`Relatório de Certificados - ${title}`, 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Emitido por: ${userEmail}`, 14, 30);

    const tableColumn = ["ID", "Cliente / Razão Social", "CPF / CNPJ", "Tipo", "Vencimento", "Situação"];
    const tableRows: any[] = [];

    const sortedData = [...data].sort((a, b) => {
      const timeA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
      const timeB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
      return timeA - timeB;
    });

    sortedData.forEach(cert => {
      // Correção de numeração da data no PDF
      const days = cert.expiry_date ? differenceInDays(startOfDay(parseISO(cert.expiry_date)), startOfDay(new Date())) : 0;
      const status = days < 0 ? 'VENCIDO' : `${days} dias`;
      const dataVencFormatada = cert.expiry_date ? format(parseISO(cert.expiry_date), 'dd/MM/yyyy') : 'N/A';
      const tipoSeguro = cert.type ? cert.type.split(' - ')[0] : 'Indefinido';
      
      const certData = [
        cert.id, cert.client_name || 'Sem Nome', formatCpfCnpj(cert.doc_number || ''),
        tipoSeguro, dataVencFormatada, status
      ];
      tableRows.push(certData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 38,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 9, cellPadding: 4 },
      didParseCell: function(dataInfo) {
        if (dataInfo.section === 'body' && dataInfo.column.index === 5 && dataInfo.cell.raw === 'VENCIDO') {
          dataInfo.cell.styles.textColor = [239, 68, 68]; 
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
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-2xl rounded-3xl p-8 shadow-2xl border ${themeCard}`}>
        
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-serif italic flex items-center gap-2"><FileText className="w-6 h-6 text-emerald-500" /> Central de Relatórios (PDF)</h3>
          <button onClick={onClose} className="text-sm underline text-neutral-500 hover:text-emerald-500">Fechar Janela</button>
        </div>

        <div className={`p-5 rounded-2xl border mb-6 ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-neutral-50 border-neutral-200'}`}>
          <h4 className={`text-sm font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>1. Montar Relatório Personalizado</h4>
          
          <div className="relative mb-3">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-neutral-400'}`} />
            <input 
              type="text" placeholder="Digite o nome (Ex: jamjoy) ou CPF/CNPJ para buscar..."
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm border ${themeInput}`}
              value={search} onChange={e => setSearch(e.target.value)}
            />
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
                  <button onClick={() => handleRemove(c.id)} className="ml-1 hover:bg-emerald-200/50 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}

          <button 
            disabled={selectedCerts.length === 0}
            onClick={() => generatePDF(selectedCerts, 'Personalizado')}
            className={`w-full p-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${selectedCerts.length > 0 ? 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700' : (isDark ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed')}`}
          >
            <FileDown className="w-4 h-4" /> Imprimir Relatório Personalizado ({selectedCerts.length})
          </button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className={`h-px flex-1 ${isDark ? 'bg-slate-700' : 'bg-neutral-200'}`}></div>
          <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-neutral-400'}`}>Ou use os Atalhos Rápidos</span>
          <div className={`h-px flex-1 ${isDark ? 'bg-slate-700' : 'bg-neutral-200'}`}></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => {
              const vencidos = certificates.filter(c => {
                if(!c.expiry_date) return false;
                // Correção de numeração da data no Filtro do PDF
                return differenceInDays(startOfDay(parseISO(c.expiry_date)), startOfDay(new Date())) < 0;
              });
              generatePDF(vencidos, 'Apenas Vencidos');
            }} 
            className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${isDark ? 'bg-red-900/20 border-red-900/50 hover:bg-red-900/40 text-red-400' : 'bg-red-50 border-red-200 hover:bg-red-100 text-red-700'}`}
          >
            <AlertTriangle className="w-6 h-6" />
            <span className="font-semibold text-sm">Somente Vencidos</span>
          </button>

          <button 
            onClick={() => generatePDF(certificates, 'Geral Completo')} 
            className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${isDark ? 'bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-300' : 'bg-neutral-100 border-neutral-200 hover:bg-neutral-200 text-neutral-700'}`}
          >
            <Database className="w-6 h-6" />
            <span className="font-semibold text-sm">Todos os Registros</span>
          </button>
        </div>

      </motion.div>
    </div>
  );
}

function ManualForm({ onClose, onSuccess, token, certificates, isDark, user }: any) {
  const [formData, setFormData] = useState({ client_name: '', doc_number: '', expiry_date: '', type: 'A1 - Arquivo', password: '', email_cliente: '' });
  
  // Novos estados para a mágica de auto-preenchimento
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
        alert("Nenhum certificado (A1 ou A3) detectado no computador no momento.");
      } else {
        setLocalCerts(certs);
        setShowLocalDropdown(true);
      }
    } catch (e) {
      alert("Erro ao ler porta USB/Cofre do Windows.");
    } finally {
      setLoadingLocal(false);
    }
  };

  const handleSelectLocalCert = (cert: any) => {
    setFormData({
      ...formData,
      client_name: cert.nome,
      doc_number: formatCpfCnpj(cert.cpf_cnpj),
      expiry_date: cert.data_vencimento,
      type: cert.cpf_cnpj.length > 11 ? 'A1 - Arquivo' : 'A3 - Cartão'
    });
    setShowLocalDropdown(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-lg rounded-3xl p-8 shadow-2xl border ${themeCard}`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-serif italic">Novo Certificado</h3>
          
          {/* BOTÃO MÁGICO DE AUTO-PREENCHIMENTO */}
          <div className="relative">
            <button 
              type="button" 
              onClick={handleFetchLocal}
              disabled={loadingLocal}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1 transition-colors ${isDark ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800 hover:bg-emerald-900/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
            >
              <Search className="w-3 h-3" />
              {loadingLocal ? 'Lendo PC...' : 'Ler do Computador'}
            </button>

            {/* LISTA SUSPENSA DE CERTIFICADOS ACHADOS NO PC COM SCROLL E BOTÃO DE FECHAR */}
            <AnimatePresence>
              {showLocalDropdown && localCerts.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`absolute right-0 top-full mt-2 w-80 rounded-xl shadow-xl border overflow-hidden z-[60] flex flex-col ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-neutral-200'}`}>
                  
                  {/* CABEÇALHO DA LISTA COM O "X" DE FECHAR */}
                  <div className={`flex items-center justify-between p-2 border-b ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-neutral-100 border-neutral-200'}`}>
                    <span className={`text-[10px] font-bold uppercase ml-2 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Selecione o Certificado</span>
                    <button type="button" onClick={() => setShowLocalDropdown(false)} className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-red-400' : 'hover:bg-neutral-200 text-neutral-500 hover:text-red-500'}`}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* LISTA COM LIMITADOR DE ALTURA E SCROLL (max-h-64 overflow-y-auto) */}
                  <div className="max-h-64 overflow-y-auto">
                    {localCerts.map((c, i) => (
                      <div key={i} onClick={() => handleSelectLocalCert(c)} className={`p-3 text-sm cursor-pointer border-b last:border-b-0 hover:bg-emerald-500/10 transition-colors ${isDark ? 'border-slate-700' : 'border-neutral-100'}`}>
                        <div className="font-bold truncate" title={c.nome}>{c.nome}</div>
                        <div className={`text-xs flex justify-between mt-1 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>
                          <span>{formatCpfCnpj(c.cpf_cnpj)}</span>
                          <span>Vence: {c.data_vencimento ? format(parseISO(c.data_vencimento), 'dd/MM/yyyy') : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>CNPJ / CPF</label>
            <input className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono border ${themeInput}`} value={formData.doc_number} maxLength={18} onChange={e => setFormData({ ...formData, doc_number: formatCpfCnpj(e.target.value) })} />
          </div>
          <div className="col-span-2">
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Razão Social</label>
            <input className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border ${themeInput}`} value={formData.client_name} onChange={e => setFormData({ ...formData, client_name: e.target.value })} />
          </div>
          <div>
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Tipo</label>
            <select className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm border ${themeInput}`} value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
              <option value="A1 - Arquivo">A1 - Arquivo</option>
              <option value="A2 - Cartão">A2 - Cartão</option>
              <option value="A2 - Token">A2 - Token</option>
              <option value="A3 - Cartão">A3 - Cartão</option>
              <option value="A3 - Token">A3 - Token</option>
              <option value="Nuvem - BirdID">Nuvem - BirdID</option>
              <option value="Nuvem - Vidaas">Nuvem - Vidaas</option>
              <option value="Nuvem - SafeID">Nuvem - SafeID</option>
            </select>
          </div>
          <div>
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Vencimento</label>
            <input type="date" className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border ${themeInput}`} value={formData.expiry_date} onChange={e => setFormData({ ...formData, expiry_date: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Senha</label>
            <input className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border ${themeInput}`} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>E-mail do Cliente (Opcional)</label>
            <input type="email" placeholder="ex: contato@empresa.com" className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border ${themeInput}`} value={formData.email_cliente} onChange={e => setFormData({ ...formData, email_cliente: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className={`flex-1 p-3 border rounded-xl transition-colors font-semibold ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>Cancelar</button>
          
          <button onClick={async () => { 
            try {
              const docLimpo = formData.doc_number.replace(/\D/g, '');
              const certExistente = certificates.find((c: any) => (c.client_name && c.client_name.toLowerCase() === formData.client_name.toLowerCase() && formData.client_name.trim() !== '') || (docLimpo !== '' && (c.doc_number ? c.doc_number.replace(/\D/g, '') : '') === docLimpo));
              
              if (certExistente) {
                if (window.confirm(`⚠️ O cliente "${certExistente.client_name}" já existe!\n\nDeseja SUBSTITUIR os dados antigos por estes novos?`)) {
                  if (user && user.role < 2) {
                    const senhaDigitada = window.prompt("🔒 AÇÃO RESTRITA: Digite a senha do Administrador para autorizar a substituição deste certificado:");
                    if (senhaDigitada !== "extrema2026") {
                      alert("❌ Senha de autorização incorreta ou cancelada. Operação bloqueada.");
                      return; 
                    }
                  }
                  await api.editCertificate(token, certExistente.id, formData); 
                  onSuccess(); 
                  return;
                } else if (!window.confirm("Certeza que deseja criar uma DUPLICATA no sistema?")) return; 
              }
              await api.addCertificate(token, formData); 
              onSuccess(); 
            } catch (err) { alert("Erro ao Salvar: Verifique os dados."); }
          }} className="flex-1 p-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-md">Salvar Registro</button>
        </div>
      </motion.div>
    </div>
  );
}

function EditForm({ cert, onClose, onSuccess, token, isDark }: any) {
  const [formData, setFormData] = useState({ 
    client_name: cert.client_name || '', 
    doc_number: formatCpfCnpj(cert.doc_number || ''), 
    expiry_date: cert.expiry_date ? cert.expiry_date.split('T')[0] : '', 
    type: cert.type === 'A1' ? 'A1 - Arquivo' : cert.type === 'A2' ? 'A2 - Cartão' : cert.type === 'A3' ? 'A3 - Cartão' : (cert.type || 'A1 - Arquivo'), 
    password: cert.password || '',
    email_cliente: cert.email_cliente || '' 
  });
  
  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200 border-t-blue-500' : 'bg-white border-neutral-200 border-t-blue-500';
  const themeInput = isDark ? 'bg-slate-900 border-slate-600 text-slate-200' : 'bg-neutral-50 border-neutral-200 text-neutral-900';
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-lg rounded-3xl p-8 shadow-2xl border-t-8 ${themeCard}`}>
        <h3 className="text-xl font-serif italic mb-6">Alterar Certificado #{cert.id}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>CNPJ / CPF</label>
            <input className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono border ${themeInput}`} value={formData.doc_number} maxLength={18} onChange={e => setFormData({ ...formData, doc_number: formatCpfCnpj(e.target.value) })} />
          </div>
          <div className="col-span-2">
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Razão Social</label>
            <input className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border ${themeInput}`} value={formData.client_name} onChange={e => setFormData({ ...formData, client_name: e.target.value })} />
          </div>
          <div>
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Tipo</label>
            <select className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm border ${themeInput}`} value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
              <option value="A1 - Arquivo">A1 - Arquivo</option>
              <option value="A2 - Cartão">A2 - Cartão</option>
              <option value="A2 - Token">A2 - Token</option>
              <option value="A3 - Cartão">A3 - Cartão</option>
              <option value="A3 - Token">A3 - Token</option>
              <option value="Nuvem - BirdID">Nuvem - BirdID</option>
              <option value="Nuvem - Vidaas">Nuvem - Vidaas</option>
              <option value="Nuvem - SafeID">Nuvem - SafeID</option>
            </select>
          </div>
          <div>
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Vencimento</label>
            <input type="date" className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border ${themeInput}`} value={formData.expiry_date} onChange={e => setFormData({ ...formData, expiry_date: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>Senha</label>
            <input className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border ${themeInput}`} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={`text-[10px] uppercase tracking-widest font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-400'}`}>E-mail do Cliente (Opcional)</label>
            <input type="email" placeholder="ex: contato@empresa.com" className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border ${themeInput}`} value={formData.email_cliente} onChange={e => setFormData({ ...formData, email_cliente: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className={`flex-1 p-3 border rounded-xl transition-colors font-semibold ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>Cancelar</button>
          <button onClick={async () => { try { await api.editCertificate(token, cert.id, formData); onSuccess(); } catch (err) { alert("Erro ao Atualizar!"); } }} className="flex-1 p-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-md">Atualizar Registro</button>
        </div>
      </motion.div>
    </div>
  );
}

function BatchUpload({ onClose, isDark }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-md rounded-3xl p-8 shadow-2xl text-center border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200'}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? 'bg-slate-700' : 'bg-emerald-50'}`}><FolderUp className="text-emerald-500 w-8 h-8" /></div>
        <h3 className="text-xl font-serif italic mb-2">Importação de Pastas</h3>
        <p className={`text-sm mb-8 ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>O Crawler Java precisa ser acionado pelo servidor para ler as pastas locais de forma segura.</p>
        <button onClick={onClose} className={`w-full p-3 rounded-xl font-semibold transition-colors ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-neutral-100 hover:bg-neutral-200'}`}>Entendi, Fechar</button>
      </motion.div>
    </div>
  );
}

function CSVUpload({ onClose, isDark, token, notify, reloadData }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';

  const handleUpload = async () => {
    if (!file) return alert("Selecione um arquivo CSV do seu computador primeiro!");
    setLoading(true);
    try {
      const res = await api.importCSV(token, file);
      if (res.error) throw new Error(res.error);
      notify(res.message);
      reloadData();
      onClose();
    } catch (err: any) {
      alert("Erro na importação: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-md rounded-3xl p-8 shadow-2xl text-center border ${themeCard}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? 'bg-slate-700' : 'bg-emerald-50'}`}>
          <FileSpreadsheet className="text-emerald-500 w-8 h-8" />
        </div>
        <h3 className="text-xl font-serif italic mb-2">Robô Importador de CSV</h3>
        <p className={`text-xs mb-6 leading-relaxed ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>
          Envie sua planilha. O robô vai ler todas as linhas, procurar por e-mails de forma inteligente e vincular ao cadastro do cliente correspondente.
        </p>
        
        <input 
          type="file" 
          accept=".csv" 
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className={`my-4 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold ${isDark ? 'text-slate-400 file:bg-slate-700 file:text-emerald-400 hover:file:bg-slate-600' : 'text-slate-500 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100'}`} 
        />
        
        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className={`flex-1 p-3 border rounded-xl transition-colors font-semibold ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>Cancelar</button>
          <button onClick={handleUpload} disabled={loading} className="flex-1 p-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-md disabled:opacity-50">
            {loading ? 'Processando...' : 'Iniciar Robô'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function UsersModal({ onClose, isDark, token }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [newLogin, setNewLogin] = useState(''); const [newSenha, setNewSenha] = useState(''); const [newNivel, setNewNivel] = useState('1'); 
  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';
  const themeInput = isDark ? 'bg-slate-900 border-slate-600 text-slate-200' : 'bg-neutral-50 border-neutral-200 text-neutral-900';

  useEffect(() => { loadUsers(); }, []);
  const loadUsers = async () => { try { const data = await api.getUsers(token); setUsers(data); } catch(e) {} };
  const handleAddUser = async (e: any) => { e.preventDefault(); try { await api.addUser(token, { login: newLogin, senha: newSenha, nivel: newNivel }); setNewLogin(''); setNewSenha(''); loadUsers(); } catch(err) { alert("Erro ao adicionar."); } };
  const handleDeleteUser = async (id: number) => { if (window.confirm("Remover este acesso?")) { await api.deleteUser(token, id); loadUsers(); } };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-3xl rounded-3xl p-8 shadow-2xl border ${themeCard} max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-serif italic flex items-center gap-2"><Users className="w-6 h-6 text-emerald-500" /> Gestão de Acessos</h3><button onClick={onClose} className="text-sm underline text-neutral-500 hover:text-emerald-500">Fechar Janela</button></div>
        <form onSubmit={handleAddUser} className={`p-4 rounded-2xl mb-6 border flex flex-col sm:flex-row gap-3 items-end ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-neutral-50 border-neutral-200'}`}>
          <div className="flex-1 w-full"><label className={`text-[10px] uppercase font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Usuário</label><input required type="text" className={`w-full p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-sm border ${themeInput}`} value={newLogin} onChange={e => setNewLogin(e.target.value)} /></div>
          <div className="flex-1 w-full"><label className={`text-[10px] uppercase font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Senha</label><input required type="password" className={`w-full p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-sm border ${themeInput}`} value={newSenha} onChange={e => setNewSenha(e.target.value)} /></div>
          <div className="flex-1 w-full"><label className={`text-[10px] uppercase font-bold mb-1 block ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>Nível</label><select className={`w-full p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-sm border ${themeInput}`} value={newNivel} onChange={e => setNewNivel(e.target.value)}><option value="0">0 - Visitante</option><option value="1">1 - Operador</option><option value="2">2 - Administrador</option></select></div>
          <button type="submit" className="w-full sm:w-auto p-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm flex items-center justify-center gap-1 font-semibold text-sm"><Plus className="w-4 h-4" /> Adicionar</button>
        </form>
        <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-neutral-200'}`}>
          <table className="w-full text-left text-sm whitespace-nowrap"><thead className={isDark ? 'bg-slate-900/80 text-slate-400' : 'bg-neutral-100 text-neutral-500'}><tr><th className="p-3 font-bold uppercase tracking-widest text-[10px]">ID</th><th className="p-3 font-bold uppercase tracking-widest text-[10px]">Login</th><th className="p-3 font-bold uppercase tracking-widest text-[10px]">Nível</th><th className="p-3 font-bold uppercase tracking-widest text-[10px] text-right">Ação</th></tr></thead><tbody>{users.map(u => (<tr key={u.id} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/50' : 'border-neutral-100 hover:bg-neutral-50'}`}><td className="p-3 font-mono text-xs opacity-50">#{u.id}</td><td className="p-3 font-medium">{u.login}</td><td className="p-3"><span className={`px-2 py-1 rounded text-xs font-semibold ${u.nivel === 2 ? (isDark ? 'bg-purple-900/30 text-purple-400 border-purple-800' : 'bg-purple-100 text-purple-700 border-purple-200') : (isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-neutral-100 text-neutral-600 border-neutral-200')}`}>{u.nivel === 0 ? 'Visitante' : u.nivel === 1 ? 'Operador' : 'Admin'}</span></td><td className="p-3 text-right">{u.id !== 1 && ( <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 text-red-500 hover:bg-red-100/20 rounded transition-colors"><Trash2 className="w-4 h-4" /></button> )}</td></tr>))}</tbody></table>
        </div>
      </motion.div>
    </div>
  );
}

function LogsModal({ onClose, isDark, token }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';
  useEffect(() => { const fetchLogs = async () => { try { const data = await api.getLogs(token); setLogs(data); } catch(e) {} }; fetchLogs(); }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-4xl rounded-3xl p-8 shadow-2xl border ${themeCard} h-[85vh] flex flex-col`}>
        <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-serif italic flex items-center gap-2"><History className="w-6 h-6 text-blue-500" /> Registro de Atividades (Logs)</h3><button onClick={onClose} className="text-sm underline text-neutral-500 hover:text-blue-500">Fechar Janela</button></div>
        <div className={`flex-1 overflow-y-auto rounded-xl border ${isDark ? 'border-slate-700' : 'border-neutral-200'}`}>
          <table className="w-full text-left text-sm"><thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-900 text-slate-400 border-b border-slate-700' : 'bg-neutral-100 text-neutral-500 border-b border-neutral-200'}`}><tr><th className="p-3 font-bold uppercase tracking-widest text-[10px]">Data e Hora</th><th className="p-3 font-bold uppercase tracking-widest text-[10px]">Usuário</th><th className="p-3 font-bold uppercase tracking-widest text-[10px]">Ação Realizada no Sistema</th></tr></thead><tbody>{logs.map(log => (<tr key={log.id} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/50' : 'border-neutral-100 hover:bg-neutral-50'}`}><td className="p-3 font-mono text-xs opacity-70 whitespace-nowrap">{log.data_hora}</td><td className="p-3 font-semibold uppercase text-xs text-blue-500">{log.usuario}</td><td className="p-3 text-xs leading-relaxed">{log.acao}</td></tr>))}{logs.length === 0 && (<tr><td colSpan={3} className="p-8 text-center text-neutral-400">Nenhum log registrado.</td></tr>)}</tbody></table>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// NOVO MODAL: RESTAURAR BANCO DE DADOS A PARTIR DO .SQL
// ============================================================================
function RestoreModal({ onClose, isDark, token, notify, reloadData }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const themeCard = isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-neutral-200';

  const handleUpload = async () => {
    if (!file) return alert("Selecione o arquivo .sql do seu computador!");
    if (!window.confirm("⚠️ ATENÇÃO MÁXIMA!\n\nIsso vai apagar todos os dados atuais do sistema e substituir pelo backup selecionado.\nTem certeza absoluta que deseja continuar?")) return;
    
    setLoading(true);
    try {
      const res = await api.restoreBackup(token, file);
      notify(res.message);
      reloadData(); // Recarrega a tabela na hora
      onClose();
    } catch (err: any) { alert("Erro: " + err.message); } 
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-md rounded-3xl p-8 shadow-2xl text-center border border-t-8 border-t-red-500 ${themeCard}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}>
          <Database className="text-red-500 w-8 h-8" />
        </div>
        <h3 className="text-xl font-serif italic mb-2">Restaurar Banco de Dados</h3>
        <p className={`text-xs mb-6 leading-relaxed ${isDark ? 'text-slate-400' : 'text-neutral-500'}`}>
          Selecione o arquivo <b>.sql</b> de backup. O sistema será reescrito exatamente como estava na data em que o arquivo foi gerado.
        </p>
        
        <input 
          type="file" 
          accept=".sql" 
          onChange={(e) => setFile(e.target.files?.[0] || null)} 
          className={`my-4 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold ${isDark ? 'text-slate-400 file:bg-slate-700 file:text-red-400 hover:file:bg-slate-600' : 'text-slate-500 file:bg-red-50 file:text-red-700 hover:file:bg-red-100'}`} 
        />
        
        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className={`flex-1 p-3 border rounded-xl transition-colors font-semibold ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>Cancelar</button>
          <button onClick={handleUpload} disabled={loading} className="flex-1 p-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors shadow-md disabled:opacity-50">
            {loading ? 'Restaurando...' : 'Iniciar Restauração'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}