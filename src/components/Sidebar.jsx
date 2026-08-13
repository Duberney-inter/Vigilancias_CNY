import React, { useState } from 'react';
import { Menu, X, LayoutDashboard, QrCode, FileText, Settings, LogOut } from 'lucide-react';

const Sidebar = ({ user, onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleSidebar = () => setIsOpen(!isOpen);

    const menuItems = [
        { name: 'Dashboard', icon: <LayoutDashboard size={20} />, roles: ['ANY'] },
        { name: 'Escanear QR', icon: <QrCode size={20} />, roles: ['DOCENTE', 'JEFE DE AREA', 'ADMINISTRADOR GENERAL'] },
        { name: 'Reportes', icon: <FileText size={20} />, roles: ['ADMINISTRADOR GENERAL', 'DIRECTOR', 'ASISTENTE'] },
        { name: 'Configuración', icon: <Settings size={20} />, roles: ['ADMINISTRADOR GENERAL'] },
    ];

    const filteredItems = menuItems.filter(item =>
        item.roles.includes('ANY') || item.roles.includes(user?.rol)
    );

    return (
        <>
            {/* Mobile Toggle Button */}
            <button
                onClick={toggleSidebar}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-navy)',
                    color: 'white',
                    border: 'none',
                    boxShadow: 'var(--shadow-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1100,
                    cursor: 'pointer'
                }}
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Sidebar Overlay */}
            {isOpen && (
                <div
                    onClick={toggleSidebar}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        zIndex: 1050
                    }}
                />
            )}

            {/* Sidebar Content */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: isOpen ? 0 : '-280px',
                width: '280px',
                height: '100%',
                backgroundColor: 'var(--color-gray-surface)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 1060,
                transition: 'right 0.3s ease',
                padding: '80px 20px 20px',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ flex: 1 }}>
                    {filteredItems.map((item, index) => (
                        <div
                            key={index}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px 15px',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                marginBottom: '5px',
                                color: 'var(--text-dark)',
                                transition: 'background 0.2s',
                                ':hover': { backgroundColor: 'var(--color-gray-bg)' }
                            }}
                        >
                            <span style={{ color: 'var(--color-navy)' }}>{item.icon}</span>
                            <span style={{ fontWeight: 500 }}>{item.name}</span>
                        </div>
                    ))}
                </div>

                <button
                    onClick={onLogout}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 15px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        backgroundColor: 'transparent',
                        border: 'none',
                        width: '100%',
                        textAlign: 'left',
                        color: 'var(--color-red-primary)',
                        fontWeight: 'bold',
                        marginTop: 'auto'
                    }}
                >
                    <LogOut size={20} />
                    <span>Cerrar Sesión</span>
                </button>
            </div>
        </>
    );
};

export default Sidebar;
