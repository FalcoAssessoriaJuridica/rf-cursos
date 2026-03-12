import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { BookOpen, Clock, PlayCircle, Search, Star, Play } from 'lucide-react';

export default function CourseList() {
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('');

    useEffect(() => {
        const storedName = localStorage.getItem('rf_user_name');
        if (storedName) setUserName(storedName.split(' ')[0]);

        async function fetchCourses() {
            try {
                const userId = localStorage.getItem('rf_user_id');
                if (!userId) {
                    navigate('/login');
                    return;
                }

                // Fetch only enrolled courses with active status
                const { data, error } = await supabase
                    .from('inscricoes')
                    .select('status, data_expiracao, curso_id, cursos(*)')
                    .eq('perfil_id', userId)
                    .neq('status', 'bloqueado');

                if (error) throw error;

                // Fetch all lessons per course to calculate total
                const { data: allAulas } = await supabase.from('aulas').select('id, modulo_id, modulos(curso_id)');
                const aulasPerCourse = {};
                allAulas?.forEach(aula => {
                    const cursoId = aula.modulos?.curso_id;
                    if (cursoId) aulasPerCourse[cursoId] = (aulasPerCourse[cursoId] || 0) + 1;
                });

                // Fetch student's progress
                const { data: userProgress } = await supabase
                    .from('progresso')
                    .select('aula_id')
                    .eq('perfil_id', userId)
                    .eq('concluida', true);

                const completedAulasIds = new Set(userProgress?.map(p => p.aula_id) || []);

                // Filter and enrich courses with real progress
                const enrichedCourses = data
                    ?.filter(ins => !ins.data_expiracao || new Date(ins.data_expiracao) > new Date())
                    ?.map(ins => {
                        const course = ins.cursos;
                        const total = aulasPerCourse[course.id] || 0;

                        // Count completed lessons that belong to this course
                        const completed = allAulas?.filter(a =>
                            a.modulos?.curso_id === course.id && completedAulasIds.has(a.id)
                        ).length || 0;

                        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

                        return {
                            ...course,
                            progress_percent: percent
                        };
                    }) || [];

                setCourses(enrichedCourses);
            } catch (err) {
                console.error('Error fetching courses:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchCourses();
    }, [navigate]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.3
            }
        }
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 20, scale: 0.95 },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="relative w-20 h-20">
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-20">
            {/* HERO SECTION */}
            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden p-8 md:p-12 rounded-[2.5rem] liquid-glass border-white/5"
            >
                <div className="relative z-10 max-w-2xl">
                    <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-luxury-gold uppercase leading-none mb-4">
                        Olá, {userName || 'Estudante'}
                    </h1>
                    <p className="text-white/60 text-lg md:text-xl font-light tracking-wide max-w-md">
                        Bem-vindo de volta à sua jornada musical. Continue de onde parou.
                    </p>
                </div>

                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-primary/10 blur-[100px] rounded-full" />
                <div className="absolute bottom-0 left-1/2 w-40 h-40 bg-purple-500/10 blur-[80px] rounded-full" />
            </motion.header>

            {/* SEARCH & FILTER AREA */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between px-2">
                <div className="relative w-full md:w-96 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30 group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        placeholder="Pesquisar nos seus cursos..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all backdrop-blur-md"
                    />
                </div>
            </div>

            {/* COURSE GRID */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
            >
                {courses.length > 0 ? (
                    courses.map((course) => (
                        <motion.div
                            key={course.id}
                            variants={cardVariants}
                            onClick={() => navigate(`/student/course/${course.id}/lesson/latest`)}
                            className="group cursor-pointer perspective-1000"
                        >
                            <div className="card-3d liquid-glass rounded-[2rem] overflow-hidden border-white/5 shadow-2xl transition-transform duration-500 hover:scale-[1.02] flex flex-col h-full">
                                {/* COURSE IMAGE */}
                                <div className="relative h-56 overflow-hidden">
                                    {course.capa_url ? (
                                        <img
                                            src={course.capa_url}
                                            alt={course.titulo}
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            style={{
                                                objectPosition: `${course.capa_posicao_x || 50}% ${course.capa_posicao_y || 50}%`
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-black/40">
                                            <Play className="h-12 w-12 text-primary/20 group-hover:text-primary transition-colors duration-500" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

                                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white">
                                        <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-black tracking-widest uppercase">
                                            <Star className="h-3 w-3 text-primary" />
                                            <span>Premium Course</span>
                                        </div>
                                    </div>
                                </div>

                                {/* COURSE INFO */}
                                <div className="p-6 flex flex-col flex-grow space-y-4">
                                    <h3 className="text-xl font-black text-white group-hover:text-primary transition-colors line-clamp-2 tracking-tight">
                                        {course.titulo}
                                    </h3>

                                    <div className="flex-grow">
                                        <p className="text-sm text-white/40 line-clamp-2 leading-relaxed">
                                            {course.descricao}
                                        </p>
                                    </div>

                                    {/* PROGRESS AREA */}
                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                        <div className="flex justify-between items-center text-[10px] font-bold tracking-widest uppercase text-white/40">
                                            <span>Progresso</span>
                                            <span className="text-primary">{course.progress_percent}%</span>
                                        </div>
                                        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${course.progress_percent}%` }}
                                                transition={{ duration: 1, delay: 0.5 }}
                                                className="bg-primary h-full shadow-[0_0_10px_rgba(212,175,55,0.4)]"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between pt-2">
                                            <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold tracking-widest uppercase">
                                                <Clock className="h-4 w-4" />
                                                <span>Acesso Vitalício</span>
                                            </div>
                                            <div className="p-3 rounded-full bg-primary text-black scale-0 group-hover:scale-100 transition-transform duration-300 shadow-lg shadow-primary/20">
                                                <PlayCircle className="h-5 w-5 fill-current" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))
                ) : (
                    <div className="col-span-full py-20 text-center liquid-glass rounded-[2rem] border-dashed border-white/10">
                        <Play className="h-12 w-12 text-white/10 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Sem cursos por aqui</h3>
                        <p className="text-white/40">Você ainda não está inscrito em nenhum curso.</p>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

