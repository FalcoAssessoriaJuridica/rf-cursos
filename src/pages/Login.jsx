import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Lock, Mail } from 'lucide-react';

export default function Login() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // 1. Check for Master Password (as per requirements)
            const masterPassword = import.meta.env.VITE_ADMIN_MASTER_PASSWORD || 'admin';

            // Permitir login administrativo se a senha for a Master Password E o e-mail for o autorizado
            if (password === masterPassword && email === 'falco.adv@gmail.com') {
                localStorage.setItem('rf_role', 'admin');
                navigate('/admin');
                return;
            }

            // 2. Login via Tabela de Perfis para Alunos
            const { data: profile, error: pError } = await supabase
                .from('perfis')
                .select('*')
                .eq('email', email)
                .eq('senha', password)
                .single();

            if (pError || !profile) {
                setError('Falha no login. Verifique seu e-mail e senha.');
                return;
            }

            // Login de Aluno bem-sucedido
            localStorage.setItem('rf_role', 'student');
            localStorage.setItem('rf_user_id', profile.id);
            localStorage.setItem('rf_user_email', profile.email);
            localStorage.setItem('rf_user_name', profile.nome_completo);

            navigate('/student');

        } catch (err) {
            setError('Falha no login. Verifique suas credenciais.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full bg-surface/50 border-primary/20 shadow-[0_0_50px_rgba(212,175,55,0.1)]">
            <CardHeader>
                <CardTitle className="text-center text-primary text-3xl font-bold tracking-widest">
                    ACESSAR
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-5 w-5 text-text-muted" />
                            <Input
                                type="email"
                                placeholder="Seu e-mail"
                                className="pl-10 bg-black/50 border-primary/30 focus:border-primary"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-5 w-5 text-text-muted" />
                            <Input
                                type="password"
                                placeholder="Sua senha"
                                className="pl-10 bg-black/50 border-primary/30 focus:border-primary"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded border border-red-500/20">
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-primary to-yellow-600 hover:from-yellow-400 hover:to-yellow-700 text-black font-bold text-lg"
                        isLoading={loading}
                    >
                        ENTRAR
                    </Button>

                    <div className="text-center text-xs text-text-muted mt-4">
                        Esqueceu sua senha? Entre em contato com o suporte.
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
