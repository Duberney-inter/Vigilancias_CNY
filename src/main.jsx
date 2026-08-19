import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

// Service Worker (app shell offline + Background Sync). Solo en producción:
// en dev interferiría con el hot-reload de Vite.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.error('No se pudo registrar el Service Worker:', err);
        });
    });
}
