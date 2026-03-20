import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, Users, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';

export default function MainLayout({ isAdmin = false }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [userName, setUserName] = useState('');

    useEffect(() => {
        // Sistema usa autenticação customizada via localStorage
        const role = localStorage.getItem('rf_role');

        if (role === 'admin') {
            // Admin: busca o nome do perfil pelo email do admin
            async function fetchAdminName() {
                const { data } = await supabase
                    .from('perfis')
                    .select('nome_completo')
                    .eq('email', 'falco.adv@gmail.com')
                    .single();
                if (data?.nome_completo) {
                    setUserName(data.nome_completo.split(' ')[0]);
                } else {
                    setUserName('Admin');
                }
            }
            fetchAdminName();
        } else {
            // Aluno: nome já está salvo no localStorage pelo Login.jsx
            const storedName = localStorage.getItem('rf_user_name');
            if (storedName) {
                setUserName(storedName.split(' ')[0]);
            }
        }
    }, []);

    const handleLogout = async () => {
        localStorage.removeItem('rf_role');
        localStorage.removeItem('rf_user_id');
        localStorage.removeItem('rf_user_email');
        localStorage.removeItem('rf_user_name');
        navigate('/login');
    };

    const navItems = isAdmin
        ? [
            { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
            { href: '/admin/courses', label: 'Cursos', icon: BookOpen },
            { href: '/admin/students', label: 'Alunos', icon: Users },
        ]
        : [
            { href: '/student', label: 'Meus Cursos', icon: BookOpen },
        ];

    return (
        <div className="min-h-screen bg-background flex relative overflow-hidden">
            {/* Sidebar - Hotmart Inspired */}
            <aside className="w-20 lg:w-64 bg-surface/50 backdrop-blur-xl border-r border-white/5 flex flex-col transition-all duration-300 z-50">
                <div className="p-4 lg:p-6 flex justify-center lg:justify-start">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-primary opacity-25 group-hover:opacity-50 blur transition duration-1000 group-hover:duration-200" />
                        <img
                            src="/logo-rf.png"
                            alt="RF Logo"
                            className="relative h-12 w-12 lg:h-14 lg:w-14 object-cover rounded-xl border border-primary/20 shadow-2xl"
                        />
                    </div>
                </div>

                <nav className="flex-1 px-3 lg:px-4 mt-6 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={cn(
                                    'flex items-center justify-center lg:justify-start px-3 py-3 text-sm font-medium rounded-xl transition-all duration-300 group',
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

                <div className="p-4 border-t border-white/5">
                    <button
                        className="flex items-center justify-center lg:justify-start w-full px-3 py-3 text-sm font-medium text-red-500/80 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all duration-300 group"
                        onClick={handleLogout}
                    >
                        <LogOut className="h-6 w-6 lg:mr-2 transition-transform group-hover:-translate-x-1" />
                        <span className="hidden lg:inline">Sair</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header Section */}
                <header className="h-16 lg:h-20 border-b border-white/5 flex items-center justify-between px-6 lg:px-8 bg-surface/30 backdrop-blur-md">
                    <div>
                        <h2 className="text-lg lg:text-xl font-bold text-text truncate">
                            Olá, <span className="text-luxury-gold">{userName || 'Carregando...'}</span>
                        </h2>
                        <p className="text-xs text-text-muted">Bem-vindo de volta!</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-xs font-medium text-text-muted">Sistema Online</span>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto">
                    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
