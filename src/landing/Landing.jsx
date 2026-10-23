import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Player } from '@remotion/player';
import { ArrowRight, KeyRound, Lock, Moon, Music2, PlayCircle, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { HeroReel, HERO_REEL } from './reels/HeroReel';
import { StaffReel, STAFF_REEL } from './reels/StaffReel';
import capaJazz from '../assets/landing/capa-jazz.webp';
import capaPiano from '../assets/landing/capa-piano.webp';
import './landing.css';

// destino do botão principal: quem já entrou vai direto para a área dele
const entryTarget = () => {
    try {
        const role = localStorage.getItem('rf_role');
        if (role === 'admin') return { to: '/admin', label: 'Ir para o painel' };
        if (role === 'student' && localStorage.getItem('rf_user_id')) return { to: '/student', label: 'Continuar estudando' };
    } catch { /* storage indisponível */ }
    return { to: '/login', label: 'Entrar na plataforma' };
};

function Reveal({ children, delay = 0, className = '', as = 'div' }) {
    const reduce = useReducedMotion();
    const Tag = motion[as];
    return (
        <Tag
            className={className}
            initial={reduce ? false : { opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
        >
            {children}
        </Tag>
    );
}

// botão que "puxa" levemente em direção ao cursor (valores de movimento, fora do ciclo de render)
function MagneticLink({ to, children, className = '' }) {
    const reduce = useReducedMotion();
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const sx = useSpring(x, { stiffness: 180, damping: 16 });
    const sy = useSpring(y, { stiffness: 180, damping: 16 });
    const onMove = (e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * 0.22);
        y.set((e.clientY - (r.top + r.height / 2)) * 0.3);
    };
    const reset = () => { x.set(0); y.set(0); };
    return (
        <motion.span style={{ x: sx, y: sy, display: 'inline-block' }} onMouseMove={onMove} onMouseLeave={reset}>
            <Link to={to} className={className}>{children}</Link>
        </motion.span>
    );
}

// Remotion Player: toca a composição em loop, sem controles. Com "reduzir movimento", mostra um quadro parado.
function Reel({ component, spec, label, still }) {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const visible = useInView(ref, { margin: '120px' });
    const [playing, setPlaying] = useState(false);
    useEffect(() => { setPlaying(visible && !reduce); }, [visible, reduce]);
    const player = useRef(null);
    useEffect(() => {
        const p = player.current;
        if (!p) return;
        if (playing) p.play(); else p.pause();
    }, [playing]);
    return (
        <div ref={ref} role="img" aria-label={label} className="lp-reel">
            <Player
                ref={player}
                component={component}
                durationInFrames={spec.durationInFrames}
                compositionWidth={spec.width}
                compositionHeight={spec.height}
                fps={spec.fps}
                initialFrame={still}
                loop
                controls={false}
                clickToPlay={false}
                doubleClickToFullscreen={false}
                spaceKeyToPlayOrPause={false}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
}

function TiltFrame({ children, className = '' }) {
    const reduce = useReducedMotion();
    const mx = useMotionValue(0);
    const my = useMotionValue(0);
    const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-5, 5]), { stiffness: 120, damping: 18 });
    const rotX = useSpring(useTransform(my, [-0.5, 0.5], [4, -4]), { stiffness: 120, damping: 18 });
    const onMove = (e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
    };
    return (
        <motion.div className={className} style={{ rotateX: rotX, rotateY: rotY, transformPerspective: 1200 }} onMouseMove={onMove} onMouseLeave={() => { mx.set(0); my.set(0); }}>
            {children}
        </motion.div>
    );
}

function ProgressRing() {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: '-60px' });
    const C = 2 * Math.PI * 54;
    return (
        <svg ref={ref} viewBox="0 0 128 128" className="lp-ring" aria-hidden="true">
            <circle cx="64" cy="64" r="54" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="9" />
            <motion.circle
                cx="64" cy="64" r="54" fill="none" stroke="rgb(var(--c-primary))" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={C} transform="rotate(-90 64 64)"
                initial={{ strokeDashoffset: C }}
                animate={inView ? { strokeDashoffset: C * 0.28 } : {}}
                transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            />
            <Music2 x="46" y="46" width="36" height="36" color="rgb(var(--c-primary))" strokeWidth="2" />
        </svg>
    );
}

export default function Landing() {
    const entry = useMemo(entryTarget, []);
    const { theme, toggle: toggleTheme } = useTheme();
    const year = new Date().getFullYear();

    useEffect(() => {
        document.title = 'RF Cursos — Música ensinada com ofício';
        document.body.classList.add('lp-body');
        return () => document.body.classList.remove('lp-body');
    }, []);

    return (
        <div className="lp">
            <header className="lp-nav">
                <Link to="/" className="lp-brand" aria-label="RF Cursos, página inicial">
                    <img src="/logo-rf.png" alt="" width="44" height="44" />
                    <span>RF <em>Cursos</em></span>
                </Link>
                <nav className="lp-nav-links" aria-label="Seções">
                    <a href="#estudo">O estudo</a>
                    <a href="#cursos">Cursos</a>
                </nav>
                <div className="lp-nav-actions">
                    <button type="button" onClick={toggleTheme} className="lp-themebtn" aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'} title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}>
                        {theme === 'light' ? <Moon aria-hidden /> : <Sun aria-hidden />}
                    </button>
                    <Link to={entry.to} className="lp-btn lp-btn-outline">{entry.to === '/login' ? 'Entrar' : 'Minha área'}</Link>
                </div>
            </header>

            <div role="main" className="lp-main">
                {/* ── HERO: texto à esquerda, o reel do Remotion avança sobre a coluna e sangra à direita ── */}
                <section className="lp-hero">
                    <div className="lp-hero-copy">
                        <motion.p className="lp-eyebrow" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                            RF Music · Premium Academy
                        </motion.p>
                        <h1 className="lp-h1">
                            {['Música', 'ensinada', 'com'].map((w, i) => (
                                <motion.span key={w} className="lp-word" initial={{ opacity: 0, y: '0.6em' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.15 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}>{w}</motion.span>
                            ))}
                            <motion.span className="lp-word lp-gold" initial={{ opacity: 0, y: '0.6em' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}>ofício.</motion.span>
                        </h1>
                        <motion.p className="lp-lead" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.95 }}>
                            Videoaulas, partituras e áudios em um só lugar. Entre com seu e-mail e senha e continue de onde parou.
                        </motion.p>
                        <motion.div className="lp-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 1.1 }}>
                            <MagneticLink to={entry.to} className="lp-btn lp-btn-gold">
                                {entry.label} <ArrowRight size={18} strokeWidth={2.4} />
                            </MagneticLink>
                        </motion.div>
                    </div>

                    <motion.div className="lp-hero-reel" initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1.1, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                        <TiltFrame className="lp-frame">
                            <Reel component={HeroReel} spec={HERO_REEL} label="Animação de um teclado de piano tocando uma sequência de acordes" still={36} />
                        </TiltFrame>
                    </motion.div>
                </section>


                <div className="lp-rule" aria-hidden="true" />

                {/* ── O ESTUDO ── */}
                <section id="estudo" className="lp-section">
                    <Reveal className="lp-section-head">
                        <p className="lp-eyebrow">O estudo</p>
                        <h2 className="lp-h2">Tudo o que a aula pede, <em>na mesma tela.</em></h2>
                    </Reveal>

                    <div className="lp-bento">
                        <Reveal className="lp-card lp-card-wide">
                            <div className="lp-card-media"><Reel component={StaffReel} spec={STAFF_REEL} label="Animação de uma partitura sendo lida por um cursor dourado" still={120} /></div>
                            <div className="lp-card-body">
                                <PlayCircle className="lp-ico" size={26} strokeWidth={1.8} />
                                <h3>Aula, partitura e áudio andam juntos</h3>
                                <p>Assista à videoaula e abra os materiais sem sair da página. Quando terminar, marque como concluída e avance para a próxima.</p>
                            </div>
                        </Reveal>

                        <Reveal delay={0.08} className="lp-card lp-card-ring">
                            <ProgressRing />
                            <div className="lp-card-body">
                                <h3>Continue de onde parou</h3>
                                <p>Seu progresso fica salvo a cada aula, curso por curso.</p>
                            </div>
                        </Reveal>

                    </div>
                </section>

                <div className="lp-rule" aria-hidden="true" />

                {/* ── CURSOS ── */}
                <section id="cursos" className="lp-section lp-courses">
                    <Reveal className="lp-section-head lp-section-head-right">
                        <p className="lp-eyebrow">Cursos</p>
                        <h2 className="lp-h2">Do repertório popular <em>ao jazz.</em></h2>
                    </Reveal>
                    <div className="lp-course-row">
                        <Reveal className="lp-course lp-course-a">
                            <img src={capaJazz} alt="Capa do curso Movimentos Harmônicos — Tocando Jazz" loading="lazy" />
                            <div className="lp-course-info"><span>Jazz · Harmonia</span><h3>Movimentos Harmônicos — Tocando Jazz</h3></div>
                        </Reveal>
                        <Reveal delay={0.12} className="lp-course lp-course-b">
                            <img src={capaPiano} alt="Capa do curso Piano Popular" loading="lazy" />
                            <div className="lp-course-info"><span>Piano popular</span><h3>Piano Popular</h3></div>
                        </Reveal>
                    </div>
                </section>

                <div className="lp-rule" aria-hidden="true" />

                {/* ── ACESSO ── */}
                <section id="acesso" className="lp-section lp-access">
                    <Reveal className="lp-access-card">
                        <KeyRound className="lp-ico" size={30} strokeWidth={1.6} />
                        <h2 className="lp-h2">Já é aluno? <em>Entre.</em></h2>
                        <p>Use o e-mail e a senha do seu cadastro.</p>
                        <MagneticLink to={entry.to} className="lp-btn lp-btn-gold lp-btn-lg">{entry.label} <ArrowRight size={20} strokeWidth={2.4} /></MagneticLink>
                        <p className="lp-fine"><Lock size={14} strokeWidth={2.4} /> Acesso exclusivo para alunos matriculados</p>
                    </Reveal>
                </section>
            </div>

            <footer className="lp-footer">
                <span>© {year} RF Music Academy</span>
                <span>Ambiente restrito &amp; criptografado</span>
            </footer>
        </div>
    );
}
