import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './layout/AuthLayout';
import MainLayout from './layout/MainLayout';
import Login from './pages/Login';
import RecuperarSenha from './pages/RecuperarSenha';
import RedefinirSenha from './pages/RedefinirSenha';
import Dashboard from './pages/admin/Dashboard';
import Students from './pages/admin/Students';
import Courses from './pages/admin/Courses';
import CourseContent from './pages/admin/CourseContent';
import Acervo from './pages/admin/Acervo';
import Precos from './pages/admin/Precos';
import Cadastro from './pages/Cadastro';
import Legal from './pages/Legal';
import Planos from './pages/student/Planos';
import PagamentoSucesso from './pages/student/PagamentoSucesso';
import CourseList from './pages/student/CourseList';
import Player from './pages/student/Player';
import CourseDetail from './pages/student/CourseDetail';
import Profile from './pages/student/Profile';
import Partituras from './pages/student/Partituras';
import PartituraView from './pages/student/PartituraView';
const Landing = React.lazy(() => import('./landing/Landing'));

// Guardas de rota. Decidem só o que mostrar: a sessão é validada em src/lib/auth.js (initAuth) antes de desenhar,
// e quem protege os dados é o banco (RLS do Supabase), que confere o JWT a cada consulta.
const getRole = () => {
  try {
    return localStorage.getItem('rf_role');
  } catch {
    return null;
  }
};

const AdminRoute = ({ children }) => (getRole() === 'admin' ? children : <Navigate to="/login" replace />);

// Aluno logado (rf_user_id) ou admin pré-visualizando a área do aluno
const StudentRoute = ({ children }) => {
  const role = getRole();
  const hasStudent = role === 'student' && !!localStorage.getItem('rf_user_id');
  return hasStudent || role === 'admin' ? children : <Navigate to="/login" replace />;
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { console.error("App Crash:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 text-center">
          <h1 className="text-2xl font-bold text-primary mb-4">Ops! Algo deu errado.</h1>
          <p className="mb-6">A aplicação encontrou um erro inesperado.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-primary text-black px-6 py-2 rounded-md font-bold"
          >
            Recarregar Página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
          </Route>
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/termos" element={<Legal />} />
          <Route path="/privacidade" element={<Legal />} />
          <Route path="/recuperar-senha" element={<RecuperarSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminRoute><MainLayout isAdmin={true} /></AdminRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="courses" element={<Courses />} />
            <Route path="partituras" element={<Acervo />} />
            <Route path="precos" element={<Precos />} />
            <Route path="courses/:courseId/content" element={<CourseContent />} />
          </Route>

          {/* Student Routes */}
          <Route path="/student" element={<StudentRoute><MainLayout isAdmin={false} /></StudentRoute>}>
            <Route index element={<CourseList />} />
            <Route path="perfil" element={<Profile />} />
            <Route path="planos" element={<Planos />} />
            <Route path="pagamento/sucesso" element={<PagamentoSucesso />} />
            <Route path="partituras" element={<Partituras />} />
            <Route path="partituras/:scoreId" element={<PartituraView />} />
            <Route path="course/:courseId" element={<CourseDetail />} />
            <Route path="course/:courseId/lesson/:lessonId" element={<Player />} />
          </Route>

          <Route path="/" element={<React.Suspense fallback={null}><Landing /></React.Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
