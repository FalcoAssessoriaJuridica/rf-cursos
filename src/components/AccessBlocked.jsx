import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Clock, ShieldOff } from 'lucide-react';

const COPY = {
    expirado: {
        icon: Clock,
        title: 'Acesso expirado',
        text: 'O período de acesso a este curso terminou. Para renovar e continuar estudando, fale com o nosso suporte.',
    },
    bloqueado: {
        icon: ShieldOff,
        title: 'Acesso bloqueado',
        text: 'O seu acesso a este curso foi bloqueado. Entre em contato com o suporte para mais informações.',
    },
    sem_acesso: {
        icon: Lock,
        title: 'Curso não liberado',
        text: 'Este curso não está disponível para o seu perfil. Se você acredita que é um engano, fale com o suporte.',
    },
};

export default function AccessBlocked({ reason = 'sem_acesso', expiraEm }) {
    const navigate = useNavigate();
    const { icon: Icon, title, text } = COPY[reason] || COPY.sem_acesso;
    return (
        <div className="flex flex-col items-center justify-center min-h-[55vh] text-center gap-6">
            <div className="p-5 rounded-full glass" style={{ boxShadow: '0 0 40px rgba(212,175,55,0.2)' }}>
                <Icon className="h-14 w-14 text-primary" />
            </div>
            <div className="max-w-md">
                <h1 className="text-3xl font-bold text-primary tracking-tight">{title}</h1>
                <p className="text-text-muted mt-4 leading-relaxed">{text}</p>
                {reason === 'expirado' && expiraEm && (
                    <p className="mt-2 text-sm text-text-muted">Expirou em {new Date(expiraEm).toLocaleDateString('pt-BR')}.</p>
                )}
            </div>
            <button onClick={() => navigate('/student')} className="bevel h-10 px-5 rounded-md bg-primary text-black font-semibold hover:bg-primary-hover transition-colors">
                Voltar aos cursos
            </button>
        </div>
    );
}
