import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { hydrateDemoState } from './lib/demoSync';

// Em desenvolvimento, carrega antes a configuração dos cursos demo guardada em arquivo
// (para o enquadramento de capa ser o mesmo em qualquer navegador).
hydrateDemoState().finally(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
});
