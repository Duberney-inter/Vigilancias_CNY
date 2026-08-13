import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import Header from '../components/Header';
import { login } from '../lib/api';

const Login = () => {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (localStorage.getItem('usuario_cny_2026')) {
            navigate('/dashboard');
        }
    }, [navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        const cleanUser = user.trim();
        const cleanPass = pass.trim();

        if (!cleanUser || !cleanPass) {
            Swal.fire({
                icon: 'warning',
                title: 'Atención',
                text: 'Por favor complete todos los campos',
                confirmButtonColor: '#6AB04C'
            });
            return;
        }

        setLoading(true);
        console.log("Starting login for user:", cleanUser);

        try {
            // Call the API to authenticate
            const data = await login(cleanUser, cleanPass);

            console.log("Login successful!");

            const authenticatedUser = data.user;

            // Guardar sesión (el log de inicio lo registra la API).
            const sessionData = {
                datos: authenticatedUser,
                token: data.token,
                entrada: new Date().getTime()
            };
            localStorage.setItem('usuario_cny_2026', JSON.stringify(sessionData));

            Swal.fire({
                icon: 'success',
                title: `¡Bienvenido ${authenticatedUser.nombre}!`,
                text: `Sesión iniciada como ${authenticatedUser.rol}`,
                timer: 2000,
                showConfirmButton: false
            }).then(() => {
                navigate('/dashboard');
            });

        } catch (error) {
            console.error("Critical login failure:", error);
            let message = 'Error de conexión o permisos';

            if (error.code === 'invalid-credentials') message = 'Documento o contraseña incorrectos';
            if (error.code === 'account-inactive') message = 'Su cuenta está inactiva. Contacte al administrador.';

            Swal.fire({
                icon: 'error',
                title: 'Error de Ingreso',
                text: `${message}`,
                footer: !['invalid-credentials', 'account-inactive'].includes(error.code) ? 'Consulte con el administrador técnico' : '',
                confirmButtonColor: '#E74C3C'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-card">
            <Header />
            <h3 style={{ color: 'var(--color-green-primary)', marginTop: 0 }}>Documento</h3>
            <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '15px' }}>
                    <input
                        id="vign_u"
                        type="text"
                        placeholder="Documento"
                        value={user}
                        onChange={(e) => setUser(e.target.value)}
                        required
                    />
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <input
                        id="vign_p"
                        type="password"
                        placeholder="Contraseña"
                        value={pass}
                        onChange={(e) => setPass(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="btn btn-green" disabled={loading}>
                    {loading ? (
                        <>
                            <span className="loading-spinner"></span>
                            INGRESANDO...
                        </>
                    ) : (
                        'INGRESAR'
                    )}
                </button>
            </form>
            <a href="https://wa.me/573506224730" style={{ fontSize: '12px', color: 'var(--text-light)', display: 'block', marginTop: '10px' }}>
                ¿Olvidó su contraseña?
            </a>
            <div style={{ marginTop: '15px', fontSize: '12px', color: 'var(--text-light)' }}>
                SISTEMA DE CONTROL DE VIGILANCIAS CNY PREESCOLAR © 2026
            </div>
        </div>
    );
};

export default Login;
