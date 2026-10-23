import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { hydrateDemoState } from './lib/demoSync';
import { initAuth } from './lib/auth';

// Em desenvolvimento, carrega antes a configuração dos cursos demo guardada em arquivo
// (para o enquadramento de capa ser o mesmo em qualquer navegador).
// e valida a sessão (Supabase Auth) antes de decidir qual rota mostrar
// (com limite de 4 s: se a rede travar, o app abre mesmo assim e a sessão é validada na primeira consulta)
const within = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
Promise.allSettled([hydrateDemoState(), within(initAuth(), 4000)]).finally(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
});
