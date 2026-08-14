import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import Header from '../components/Header';
import { login, forgotPassword } from '../lib/api';

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

    const handleForgotPassword = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Recuperar Contraseña',
            html: `
                <div style="text-align: left;">
                    <label style="font-weight:bold; font-size:13px; color:#555;">Documento:</label>
                    <input id="swal-fp-doc" class="swal2-input" placeholder="Número de documento">

                    <label style="font-weight:bold; font-size:13px; color:#555;">Correo registrado:</label>
                    <input id="swal-fp-email" type="email" class="swal2-input" placeholder="correo@colegio.edu.co">

                    <label style="font-weight:bold; font-size:13px; color:#555;">Nueva contraseña:</label>
                    <input id="swal-fp-pass" type="password" class="swal2-input" placeholder="Mínimo 6 caracteres">

                    <label style="font-weight:bold; font-size:13px; color:#555;">Confirmar contraseña:</label>
                    <input id="swal-fp-pass2" type="password" class="swal2-input" placeholder="Repita la contraseña">
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Cambiar Contraseña',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#6AB04C',
            preConfirm: () => {
                const documento = document.getElementById('swal-fp-doc').value.trim();
                const email = document.getElementById('swal-fp-email').value.trim();
                const newPassword = document.getElementById('swal-fp-pass').value;
                const confirmPassword = document.getElementById('swal-fp-pass2').value;

                if (!documento || !email || !newPassword || !confirmPassword) {
                    Swal.showValidationMessage('Por favor complete todos los campos');
                    return false;
                }
                if (newPassword.length < 6) {
                    Swal.showValidationMessage('La contraseña debe tener al menos 6 caracteres');
                    return false;
                }
                if (newPassword !== confirmPassword) {
                    Swal.showValidationMessage('Las contraseñas no coinciden');
                    return false;
                }

                return { documento, email, newPassword };
            }
        });

        if (!formValues) return;

        try {
            await forgotPassword(formValues.documento, formValues.email, formValues.newPassword);
            Swal.fire({
                icon: 'success',
                title: 'Contraseña actualizada',
                text: 'Ya puede iniciar sesión con su nueva contraseña.',
                confirmButtonColor: '#6AB04C'
            });
        } catch (error) {
            let message = 'No se pudo actualizar la contraseña';
            if (error.code === 'identity-mismatch') message = 'El documento y el correo no coinciden con ningún usuario registrado';
            else if (error.code === 'account-inactive') message = 'Su cuenta está inactiva. Contacte al administrador.';
            else if (error.message) message = error.message;

            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: message,
                confirmButtonColor: '#E74C3C'
            });
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
            <button
                type="button"
                onClick={handleForgotPassword}
                style={{
                    fontSize: '12px',
                    color: 'var(--text-light)',
                    display: 'block',
                    marginTop: '10px',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    width: 'auto'
                }}
            >
                ¿Olvidó su contraseña?
            </button>
            <div style={{ marginTop: '15px', fontSize: '12px', color: 'var(--text-light)' }}>
                SISTEMA DE CONTROL DE VIGILANCIAS CNY PREESCOLAR © 2026
            </div>
        </div>
    );
};

export default Login;
