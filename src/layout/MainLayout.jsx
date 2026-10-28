import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, Users, BookOpen, GraduationCap, ArrowLeft, UserRound, Music2, CreditCard, HeartHandshake } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';
import ThemeToggle from '../components/ThemeToggle';
import { DEMO_ENABLED } from '../lib/demoCourses';
import Avatar from '../components/Avatar';
import { signOut, isDemoSession } from '../lib/auth';
import OfflineBanner from '../components/OfflineBanner';

export default function MainLayout({ isAdmin = false }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [userName, setUserName] = useState('');
    const studentId = localStorage.getItem('rf_user_id');

    useEffect(() => {
        // Controle dinâmico de classe no body para fundo diferenciado
        if (isAdmin) {
            document.body.classList.remove('is-student');
            document.body.classList.add('is-admin');
        } else {
            document.body.classList.remove('is-admin');
            document.body.classList.add('is-student');
        }

        // O papel vem da sessão do Supabase (src/lib/auth.js), espelhado no localStorage
        const role = localStorage.getItem('rf_role');


        if (role === 'admin') {
            // Admin: busca o nome do perfil pelo email do admin
            async function fetchAdminName() {
                const { data } = await supabase
                    .from('perfis')
                    .select('nome_completo')
                    .eq('email', localStorage.getItem('rf_user_email') || '')
                    .maybeSingle();
                if (data?.nome_completo) {
                    setUserName(data.nome_completo.split(' ')[0]);
                } else {
                    setUserName('Admin');
                }
            }
            fetchAdminName();
        } else {
            // Aluno: nome já está salvo no localStorage pelo Login.jsx
            const readName = () => {
                const storedName = localStorage.getItem('rf_user_name');
                if (storedName) setUserName(storedName.split(' ')[0]);
            };
            readName();
            window.addEventListener('rf-profile', readName);
            return () => window.removeEventListener('rf-profile', readName);
        }
        return undefined;
    }, []);

    const handleLogout = async () => {
        await signOut(); // encerra a sessão no servidor e limpa o espelho local
        navigate('/login');
    };

    // Admin visualizando a área do aluno (direto ou "entrando como" um aluno demo) precisa de um caminho de volta
    const canReturnToAdmin = !isAdmin && (localStorage.getItem('rf_role') === 'admin' || (DEMO_ENABLED && localStorage.getItem('rf_return_admin') === '1'));

    const returnToAdmin = () => {
        // se entrou como aluno demo, restaura a sessão de admin
        if (DEMO_ENABLED && localStorage.getItem('rf_return_admin') === '1') {
            localStorage.setItem('rf_role', 'admin');
            localStorage.removeItem('rf_user_id');
            localStorage.removeItem('rf_user_email');
            localStorage.removeItem('rf_user_name');
            localStorage.removeItem('rf_return_admin');
        }
        navigate('/admin');
    };

    const navItems = isAdmin
        ? [
            { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
            { href: '/admin/courses', label: 'Cursos', icon: BookOpen },
            { href: '/admin/partituras', label: 'Acervo', icon: Music2 },
            { href: '/admin/students', label: 'Alunos', icon: Users },
            { href: '/admin/precos', label: 'Preços', icon: CreditCard },
            { href: '/admin/comunidade', label: 'Comunidade', icon: HeartHandshake },
            { href: '/student', label: 'Área do Aluno', icon: GraduationCap },
        ]
        : [
            { href: '/student', label: 'Meus Cursos', icon: BookOpen },
            { href: '/student/partituras', label: 'Partituras', icon: Music2 },
            ...(studentId && !isDemoSession() ? [{ href: '/student/comunidade', label: 'Comunidade', icon: HeartHandshake }] : []),
            ...(studentId && !isDemoSession() ? [{ href: '/student/planos', label: 'Planos', icon: CreditCard }] : []),
            ...(studentId ? [{ href: '/student/perfil', label: 'Meu perfil', icon: UserRound }] : []),
        ];

    return (
        <div className="h-[100dvh] flex relative overflow-hidden">
            {/* Sidebar - Hotmart Inspired */}
            <aside className="glass-bar !rounded-none md:!border-y-0 md:!border-l-0 max-md:!border-x-0 max-md:!border-b-0 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:h-16 max-md:flex-row max-md:items-center max-md:pb-[env(safe-area-inset-bottom)] md:w-20 lg:w-auto flex flex-col transition-all duration-300 z-50">
                <div className="max-md:hidden h-16 lg:h-20 shrink-0 px-4 lg:px-5 flex items-center justify-center lg:justify-start border-b border-white/5">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-primary opacity-25 group-hover:opacity-50 blur transition duration-1000 group-hover:duration-200" />
                        <img
                            src="/logo-rf.png"
                            alt="RF Logo"
                            className="relative h-[56px] w-[56px] object-cover rounded-xl border border-primary/20 shadow-2xl"
                        />
                    </div>
                </div>

                <nav className="flex-1 px-3 lg:px-4 mt-6 space-y-2 max-md:mt-0 max-md:space-y-0 max-md:flex max-md:items-center max-md:justify-around max-md:gap-1 max-md:px-2 max-md:min-w-0">
                    {canReturnToAdmin && (
                        <button
                            type="button"
                            onClick={returnToAdmin}
                            title="Voltar ao painel do administrador"
                            className="bevel flex md:w-full items-center justify-center lg:justify-start whitespace-nowrap px-3 py-3 max-md:py-2 text-sm font-semibold rounded-xl bg-primary text-black hover:bg-primary-hover transition-colors"
                        >
                            <ArrowLeft className="h-6 w-6 lg:mr-3" />
                            <span className="hidden lg:inline">Painel Admin</span>
                        </button>
                    )}
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={cn(
                                    'flex items-center justify-center lg:justify-start whitespace-nowrap px-3 py-3 max-md:py-2 text-sm font-medium rounded-xl transition-all duration-300 group',
                                    isActive
                                        ? 'bg-primary/10 text-primary shadow-[0_0_15px_rgba(212,175,55,0.1)]'
                                        : 'text-text-muted hover:bg-white/5 hover:text-text'
                                )}
                            >
                                <Icon className={cn(
                                    "h-6 w-6 lg:mr-3 transition-transform duration-300",
                                    isActive ? "scale-110" : "group-hover:scale-110"
                                )} />
                                <span className="hidden lg:inline">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-3 lg:px-4 border-t border-white/5 max-md:border-t-0 max-md:p-0 max-md:pr-2">
                    <button
                        className="flex items-center justify-center lg:justify-start w-full whitespace-nowrap px-3 py-3 text-sm font-medium text-red-500/80 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all duration-300 group"
                        onClick={handleLogout}
                    >
                        <LogOut className="h-6 w-6 lg:mr-3 transition-transform group-hover:-translate-x-1" />
                        <span className="hidden lg:inline">Sair</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header Section */}
                <header className="glass-bar relative z-40 !rounded-none !border-x-0 !border-t-0 h-16 lg:h-20 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-4">
                        {(isAdmin || !studentId) && <img src="/logo-rf.png" alt="" className="md:hidden h-10 w-10 rounded-lg object-cover border border-primary/30 shrink-0" />}
                        {!isAdmin && studentId && (
                            <Link to="/student/perfil" title="Meu perfil" aria-label="Meu perfil" className="flex shrink-0 rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                <Avatar userId={studentId} name={userName} className="h-[56px] w-[56px] text-sm" />
                            </Link>
                        )}
                        <div className="min-w-0">
                        <h2 className="text-lg lg:text-xl font-bold text-text truncate">
                            Olá, <span className="text-luxury-gold">{userName || 'Carregando...'}</span>
                        </h2>
                        <p className="text-xs text-text-muted">Bem-vindo de volta!</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                        <ThemeToggle />
                        <div className="max-sm:hidden flex items-center gap-3 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full whitespace-nowrap">
                            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-xs font-medium text-text-muted">Sistema Online</span>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto">
                    <div className="p-4 sm:p-6 lg:p-8 max-md:pb-24 max-w-7xl mx-auto">
                        <OfflineBanner />
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
