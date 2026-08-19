import React, { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { createLog, logout as logoutSession } from '../lib/api';
import ChangePasswordModal from '../components/ChangePasswordModal';
import Swal from 'sweetalert2';

// Cada rol solo necesita su propio dashboard: se cargan bajo demanda para no
// descargar Chart.js / html5-qrcode de los otros roles en el bundle inicial.
const DashboardAdmin = lazy(() => import('./DashboardAdmin'));
const DashboardDocente = lazy(() => import('./DashboardDocente'));
const DashboardDirector = lazy(() => import('./DashboardDirector'));

const DashboardLoading = () => (
    <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <span className="loading-spinner" style={{ borderTopColor: 'var(--color-green-primary)', borderColor: 'rgba(0,0,0,0.1)' }}></span>
        <p style={{ color: 'var(--text-light)', marginTop: '10px' }}>Cargando panel...</p>
    </div>
);

const Dashboard = () => {
    const navigate = useNavigate();
    const [showPassModal, setShowPassModal] = React.useState(false);
    const session = JSON.parse(localStorage.getItem('usuario_cny_2026'));
    const user = session?.datos;

    const logout = async () => {
        try {
            if (user) {
                await createLog({
                    usuario: user.nombre,
                    documento: user.documento || user.uid,
                    accion: "Cierre de sesión"
                });
            }
        } catch (e) {
            console.error("Error al registrar log de cierre de sesión:", e);
        }
        logoutSession();
        navigate('/login');
    };

    const confirmLogout = () => {
        Swal.fire({
            title: '¿Cerrar Sesión?',
            html: `
                <div style="text-align: center; padding: 10px;">
                    <i class="fas fa-sign-out-alt" style="font-size: 40px; color: var(--color-red-primary); margin-bottom: 15px;"></i>
                    <p>¿Estás seguro de que deseas salir del sistema?</p>
                    <small style="color: var(--text-light); display: block; margin-top: 10px;">
                        <i class="fas fa-user"></i> ${user?.nombre}
                    </small>
                </div>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, Salir',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: 'var(--color-red-primary)',
            cancelButtonColor: 'var(--color-gray-primary)',
        }).then((result) => {
            if (result.isConfirmed) {
                logout();
                Swal.fire('Sesión Cerrada', 'Has salido exitosamente.', 'success');
            }
        });
    };

    const renderRoleDashboard = () => {
        if (!user) return null; // Avoid rendering anything until user is confirmed

        switch (user.rol) {
            case 'ADMINISTRADOR GENERAL':
                return <DashboardAdmin />;
            case 'DIRECTOR':
                return <DashboardDirector />;
            case 'DOCENTE':
            case 'JEFE DE AREA':
                return <DashboardDocente />;
            case 'ASISTENTE':
                return <DashboardDirector readOnly />;
            default:
                return (
                    <div className="card">
                        <i className="fas fa-lock fa-3x" style={{ color: 'var(--color-red-primary)', marginBottom: '15px' }}></i>
                        <h3>Acceso Restringido</h3>
                        <p>Su rol no tiene permisos para esta sección.</p>
                    </div>
                );
        }
    };

    return (
        <div style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Header user={user} onLogout={confirmLogout} onProfileClick={() => setShowPassModal(true)} />

            <div id="view-dash" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Suspense fallback={<DashboardLoading />}>
                    {renderRoleDashboard()}
                </Suspense>
            </div>

            <ChangePasswordModal
                user={user}
                isOpen={showPassModal}
                onClose={() => setShowPassModal(false)}
            />

            <a href="https://wa.me/573506224730" className="whatsapp">
                <i className="fab fa-whatsapp"></i>
            </a>
        </div>
    );
};

export default Dashboard;
