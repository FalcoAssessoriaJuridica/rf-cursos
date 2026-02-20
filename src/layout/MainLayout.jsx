import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, Users, BookOpen, Music } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';

export default function MainLayout({ isAdmin = false }) {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await supabase.auth.signOut();
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
            {/* Sidebar */}
            <aside className="w-64 bg-surface border-r border-border hidden md:flex flex-col">
                <div className="p-6">
                    <h1 className="text-3xl font-black text-primary flex items-center gap-3 text-3d-relief tracking-tighter italic">
                        <Music className="h-9 w-9 icon-3d-floating" />
                        RF MUSIC
                    </h1>
                </div>

                <nav className="flex-1 px-4 space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={cn(
                                    'flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors',
                                    isActive
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-text-muted hover:bg-white/5 hover:text-text'
                                )}
                            >
                                <Icon className="mr-3 h-5 w-5" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-border">
                    <Button
                        variant="ghost"
                        className="w-full justify-start text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        onClick={handleLogout}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sair
                    </Button>
                </div>
            </aside>

            {/* Mobile Header (TODO: Add functionality for mobile menu) */}

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <div className="p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
