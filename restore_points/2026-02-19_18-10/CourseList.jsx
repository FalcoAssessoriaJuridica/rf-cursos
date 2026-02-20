import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../components/Card';
import { Play } from 'lucide-react';

export default function CourseList() {
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
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

    if (loading) return <div className="text-center text-primary mt-12">Carregando cursos...</div>;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-primary">Meus Cursos</h1>
                <p className="text-text-muted">Continue de onde parou.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.length > 0 ? (
                    courses.map((course) => (
                        <Card
                            key={course.id}
                            className="group cursor-pointer hover:border-primary/50 transition-all overflow-hidden card-3d"
                            onClick={() => navigate(`/student/course/${course.id}/lesson/latest`)}
                        >
                            <div className="aspect-video bg-surface relative overflow-hidden">
                                {course.capa_url ? (
                                    <img
                                        src={course.capa_url}
                                        alt={course.titulo}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        style={{ objectPosition: `${course.capa_posicao_x || 50}% ${course.capa_posicao_y || 50}%` }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-black/40">
                                        <Play className="h-12 w-12 text-primary/50 group-hover:text-primary transition-colors" />
                                    </div>
                                )}
                                {/* Overlay */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-primary font-bold tracking-widest border border-primary px-4 py-2 rounded uppercase text-sm">
                                        Acessar
                                    </span>
                                </div>
                            </div>
                            <CardContent className="p-4">
                                <h3 className="font-bold text-lg text-text group-hover:text-primary transition-colors">{course.titulo}</h3>
                                <p className="text-sm text-text-muted mt-1 line-clamp-2">{course.descricao}</p>
                                <div className="mt-4 w-full bg-surface border border-border rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="bg-primary h-full transition-all duration-500"
                                        style={{ width: `${course.progress_percent}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-text-muted mt-2">
                                    <span>{course.progress_percent}% concluído</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="col-span-3 text-center py-12 border border-dashed border-border rounded-lg">
                        <p className="text-text-muted">Você ainda não está inscrito em nenhum curso.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
