import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './layout/AuthLayout';
import MainLayout from './layout/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import Students from './pages/admin/Students';
import Courses from './pages/admin/Courses';
import CourseContent from './pages/admin/CourseContent';
import CourseList from './pages/student/CourseList';
import Player from './pages/student/Player';

// Admin Guard (placeholder - implementation depends on auth logic details)
const AdminRoute = ({ children }) => {
  // TODO: Add real auth check
  const isAuthenticated = true;
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Student Guard
const StudentRoute = ({ children }) => {
  // TODO: Add real auth check
  const isAuthenticated = true;
  return isAuthenticated ? children : <Navigate to="/login" />;
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

          {/* Admin Routes */}
          <Route path="/admin" element={<MainLayout isAdmin={true} />}>
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="courses" element={<Courses />} />
            <Route path="courses/:courseId/content" element={<CourseContent />} />
          </Route>

          {/* Student Routes */}
          <Route path="/student" element={<MainLayout isAdmin={false} />}>
            <Route index element={<CourseList />} />
            <Route path="course/:courseId/lesson/:lessonId" element={<Player />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
