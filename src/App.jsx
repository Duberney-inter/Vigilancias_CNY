import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { validateSession, logout as clearSession } from './lib/api';

const ProtectedRoute = ({ children }) => {
    const [status, setStatus] = useState('checking');

    useEffect(() => {
        const session = localStorage.getItem('usuario_cny_2026');
        if (!session) {
            setStatus('fail');
            return;
        }

        validateSession()
            .then(() => setStatus('ok'))
            .catch((error) => {
                // Offline-first: si falló por falta de red (sin respuesta del
                // servidor, error.status indefinido), no cerrar sesión — se
                // confía en la sesión guardada localmente hasta recuperar señal.
                if (!navigator.onLine || error.status === undefined) {
                    setStatus('ok');
                    return;
                }
                clearSession();
                setStatus('fail');
            });
    }, []);

    if (status === 'checking') {
        return (
            <div className="card" style={{ margin: '40px auto', padding: '40px', textAlign: 'center', maxWidth: '400px' }}>
                <span className="loading-spinner" style={{ borderTopColor: 'var(--color-green-primary)', borderColor: 'rgba(0,0,0,0.1)' }}></span>
                <p style={{ color: 'var(--text-light)', marginTop: '10px' }}>Validando sesión...</p>
            </div>
        );
    }

    return status === 'ok' ? children : <Navigate to="/login" replace />;
};

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />
                <Route path="/" element={<Navigate to="/dashboard" />} />
            </Routes>
        </Router>
    );
}

export default App;
