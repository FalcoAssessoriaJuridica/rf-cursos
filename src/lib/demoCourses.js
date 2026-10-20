// Cursos de demonstração (100% locais, não tocam no Supabase).
// Servem para testar a visualização de cursos, módulos e aulas.
// IDs começam com "demo-" — Player/CourseDetail/CourseList usam isso para escolher a fonte de dados.

// Vídeos gerados localmente (public/demo/video-N.mp4) a partir das imagens de teste
const V = (n) => `/demo/video-${n}.mp4`;

const aula = (id, modulo_id, ordem, titulo, duracao, thumb, extra = {}) => ({
    id,
    modulo_id,
    ordem,
    titulo,
    duracao,
    thumb: `/demo/${thumb}.webp`,
    ...extra,
});

export const DEMO_COURSES = [
    {
        id: 'demo-lideranca',
        titulo: 'Liderança & Presença Executiva',
        descricao:
            'Aprenda a construir autoridade, comunicar com clareza e conduzir reuniões e negociações com postura executiva. Curso fictício criado para testar a visualização de cursos.',
        capa_url: '/demo/1.webp',
        modulos: [
            {
                id: 'demo-lid-m1',
                titulo: 'Módulo 1 — Fundamentos',
                ordem: 1,
                aulas: [
                    aula('demo-lid-a1', 'demo-lid-m1', 1, 'Aula 1 — Boas-vindas', 90, '1', {
                        id_video_profissional: V(1),
                        descricao: 'Apresentação do curso e do método.',
                    }),
                    aula('demo-lid-a2', 'demo-lid-m1', 2, 'Aula 2 — Postura e linguagem corporal', 90, '2', {
                        id_video_profissional: V(2),
                    }),
                    aula('demo-lid-a3', 'demo-lid-m1', 3, 'Aula 3 — Comunicação assertiva', 60, '3', {
                        id_video_profissional: V(3),
                    }),
                ],
            },
            {
                id: 'demo-lid-m2',
                titulo: 'Módulo 2 — Aplicação',
                ordem: 2,
                aulas: [
                    aula('demo-lid-a4', 'demo-lid-m2', 1, 'Aula 4 — Conduzindo reuniões', 75, '4', {
                        id_video_profissional: V(4),
                    }),
                    aula('demo-lid-a5', 'demo-lid-m2', 2, 'Aula 5 — Negociação (YouTube embed)', 635, '5', {
                        id_video_profissional: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
                    }),
                    aula('demo-lid-a6', 'demo-lid-m2', 3, 'Aula 6 — Material complementar (sem vídeo)', 0, '6', {
                        materiais_pdf: [{ nome: 'Checklist de reunião', url: 'https://example.com/checklist.pdf' }],
                    }),
                ],
            },
        ],
    },
    {
        id: 'demo-imagem',
        titulo: 'Imagem Profissional & Marca Pessoal',
        descricao:
            'Posicionamento, fotografia, vestimenta e narrativa para quem vive de confiança. Curso fictício para testar a grade de cursos, a lista de módulos e o player.',
        capa_url: '/demo/7.webp',
        modulos: [
            {
                id: 'demo-img-m1',
                titulo: 'Módulo 1 — Identidade',
                ordem: 1,
                aulas: [
                    aula('demo-img-a1', 'demo-img-m1', 1, 'Aula 1 — Quem é você no mercado', 45, '7', {
                        id_video_profissional: V(5),
                    }),
                    aula('demo-img-a2', 'demo-img-m1', 2, 'Aula 2 — Paleta e vestimenta', 120, '8', {
                        id_video_profissional: V(6),
                    }),
                ],
            },
            {
                id: 'demo-img-m2',
                titulo: 'Módulo 2 — Fotografia',
                ordem: 2,
                aulas: [
                    aula('demo-img-a3', 'demo-img-m2', 1, 'Aula 3 — Luz e cenário', 60, '9', {
                        id_video_profissional: V(7),
                    }),
                    aula('demo-img-a4', 'demo-img-m2', 2, 'Aula 4 — Poses que transmitem autoridade', 90, '1', {
                        id_video_profissional: V(8),
                    }),
                ],
            },
        ],
    },
    {
        id: 'demo-curso-curto',
        titulo: 'Mentalidade de Alta Performance',
        descricao: 'Curso curto (1 módulo, 2 aulas) para testar o caso mínimo de visualização.',
        capa_url: '/demo/3.webp',
        modulos: [
            {
                id: 'demo-cc-m1',
                titulo: 'Módulo Único',
                ordem: 1,
                aulas: [
                    aula('demo-cc-a1', 'demo-cc-m1', 1, 'Aula 1 — Foco e disciplina', 75, '3', {
                        id_video_profissional: V(9),
                    }),
                    aula('demo-cc-a2', 'demo-cc-m1', 2, 'Aula 2 — Rotina de resultados', 90, '5', {
                        id_video_profissional: V(1),
                    }),
                ],
            },
        ],
    },
];

// ---- Enquadramento de capa dos cursos demo (editável pelo admin, salvo no navegador) ----
const COVER_KEY = 'rf_demo_covers';

export function getDemoCover(id) {
    try {
        return (JSON.parse(localStorage.getItem(COVER_KEY)) || {})[id] || {};
    } catch {
        return {};
    }
}

export function setDemoCover(id, { capa_posicao_x, capa_posicao_y, capa_zoom }) {
    try {
        const all = JSON.parse(localStorage.getItem(COVER_KEY)) || {};
        all[id] = { capa_posicao_x, capa_posicao_y, capa_zoom };
        localStorage.setItem(COVER_KEY, JSON.stringify(all));
    } catch {
        /* storage indisponível */
    }
}

export const withDemoCover = (course) => ({ ...course, ...getDemoCover(course.id) });

export const isDemoId = (id) => typeof id === 'string' && id.startsWith('demo-');

export const getDemoCourse = (id) => DEMO_COURSES.find((c) => c.id === id) || null;

// ---- Alunos demo (login local; senha única para teste) ----
export const DEMO_PASSWORD = 'demo123';

// `cursos`: id simples = acesso vitalício. Objeto = { curso_id, dias (expira em N dias a partir de hoje), bloqueado }.
// Os estados abaixo servem para testar expiração e bloqueio manual logo de início.
export const DEMO_STUDENTS = [
    { id: 'demo-aluno-1', nome_completo: 'Ana Beatriz Souza', email: 'ana.demo@rfcursos.test', cursos: ['demo-lideranca'] },
    { id: 'demo-aluno-2', nome_completo: 'Bruno Carvalho', email: 'bruno.demo@rfcursos.test', cursos: ['demo-lideranca', 'demo-imagem'] },
    { id: 'demo-aluno-3', nome_completo: 'Carla Menezes', email: 'carla.demo@rfcursos.test', cursos: ['demo-lideranca', 'demo-imagem', 'demo-curso-curto'] },
    { id: 'demo-aluno-4', nome_completo: 'Diego Ramos', email: 'diego.demo@rfcursos.test', cursos: [{ curso_id: 'demo-imagem', dias: 30 }] },
    { id: 'demo-aluno-5', nome_completo: 'Elisa Tavares', email: 'elisa.demo@rfcursos.test', cursos: ['demo-imagem', { curso_id: 'demo-curso-curto', dias: -1 }] },
    { id: 'demo-aluno-6', nome_completo: 'Fábio Nogueira', email: 'fabio.demo@rfcursos.test', cursos: [{ curso_id: 'demo-curso-curto', bloqueado: true }] },
];

export const isDemoStudentId = (id) => typeof id === 'string' && id.startsWith('demo-aluno-');

export const findDemoStudentByLogin = (email, senha) => {
    const student = DEMO_STUDENTS.find((s) => s.email === String(email).trim().toLowerCase());
    return student && senha === DEMO_PASSWORD ? student : null;
};

// ---- Expiração e bloqueio ----
const DAY = 24 * 60 * 60 * 1000;

export const addDaysISO = (days, from = new Date()) => new Date(from.getTime() + days * DAY).toISOString();

// 'ativo' | 'bloqueado' | 'expirado'  (bloqueio manual tem prioridade)
export function accessStatus({ bloqueado, expira_em } = {}) {
    if (bloqueado) return 'bloqueado';
    if (expira_em && new Date(expira_em) < new Date()) return 'expirado';
    return 'ativo';
}

export function accessLabel(expira_em) {
    if (!expira_em) return 'Acesso vitalício';
    const diff = new Date(expira_em).getTime() - Date.now();
    if (diff < 0) return `Expirou em ${new Date(expira_em).toLocaleDateString('pt-BR')}`;
    const days = Math.ceil(diff / DAY);
    if (days === 0) return 'Expira hoje';
    return days === 1 ? 'Expira em 1 dia' : `Expira em ${days} dias`;
}

const ENROLL_KEY = 'rf_demo_enrollments';

function readEnrollOverrides() {
    try {
        return JSON.parse(localStorage.getItem(ENROLL_KEY)) || {};
    } catch {
        return {};
    }
}

// Normaliza qualquer formato (id, objeto de seed, objeto salvo) para { curso_id, expira_em, bloqueado }
function normalizeEnrollment(e) {
    if (typeof e === 'string') return { curso_id: e, expira_em: null, bloqueado: false };
    return {
        curso_id: e.curso_id,
        expira_em: e.expira_em ?? (typeof e.dias === 'number' ? addDaysISO(e.dias) : null),
        bloqueado: !!e.bloqueado,
    };
}

// Matrículas demo de um aluno (padrão do cadastro, ou o que o admin salvou)
export function getDemoEnrollments(studentId) {
    const override = readEnrollOverrides()[studentId];
    const raw = Array.isArray(override) ? override : DEMO_STUDENTS.find((s) => s.id === studentId)?.cursos || [];
    return raw.map(normalizeEnrollment);
}

export function setDemoEnrollments(studentId, enrollments) {
    try {
        const all = readEnrollOverrides();
        all[studentId] = enrollments.map(normalizeEnrollment);
        localStorage.setItem(ENROLL_KEY, JSON.stringify(all));
    } catch {
        /* storage indisponível */
    }
}

// Estado de acesso do usuário atual a um curso demo: { ok, reason, expira_em }
// admin vê todos; aluno demo só os liberados (ativos); aluno real (Supabase) não vê demos.
export function demoAccessState(courseId) {
    const role = localStorage.getItem('rf_role');
    const userId = localStorage.getItem('rf_user_id');
    if (role === 'admin' && !userId) return { ok: true };
    if (isDemoStudentId(userId)) {
        const e = getDemoEnrollments(userId).find((x) => x.curso_id === courseId);
        if (!e) return { ok: false, reason: 'sem_acesso' };
        const status = accessStatus(e);
        return { ok: status === 'ativo', reason: status === 'ativo' ? null : status, expira_em: e.expira_em };
    }
    return { ok: false, reason: 'sem_acesso' };
}

export const canAccessDemoCourse = (courseId) => demoAccessState(courseId).ok;

// ---- Progresso local dos cursos demo (separado por aluno) ----
const progressKey = () => `rf_demo_progress:${localStorage.getItem('rf_user_id') || 'admin'}`;

export function readDemoProgress(studentId) {
    try {
        const key = studentId ? `rf_demo_progress:${studentId}` : progressKey();
        return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
        return {};
    }
}

export function writeDemoProgress(aulaId, patch) {
    try {
        const all = readDemoProgress();
        all[aulaId] = { ...(all[aulaId] || {}), ...patch };
        localStorage.setItem(progressKey(), JSON.stringify(all));
    } catch {
        /* storage indisponível: ignora */
    }
}

export function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return '';
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
