import React from 'react';
import { schoolData } from '../config/schoolData';
import { showSecurityPolicies } from '../utils/securityPolicies';

const Header = ({ user, onLogout, onProfileClick }) => {
    return (
        <div className="header-container">
            {user && onLogout && onProfileClick && (
                <div className="header-top-bar">
                    <button
                        type="button"
                        onClick={showSecurityPolicies}
                        className="btn-header-action"
                        title="Políticas de Seguridad y Uso de Datos"
                        aria-label="Políticas de Seguridad y Uso de Datos"
                    >
                        <i className="fas fa-info-circle"></i>
                    </button>
                    <button onClick={onProfileClick} className="btn-header-action" title="Configuración de Perfil">
                        <i className="fas fa-user-cog"></i>
                    </button>
                    <button onClick={onLogout} className="btn-header-action btn-header-logout" title="Cerrar Sesión">
                        <i className="fas fa-sign-out-alt"></i>
                    </button>
                </div>
            )}
            <img src={schoolData.logoUrl} className="logo-img" alt={`${schoolData.name} Logo`} />
            <div className="header-title">SISTEMA DE CONTROL DE VIGILANCIAS {schoolData.name.toUpperCase()}</div>

            {user && (
                <div className="user-profile-header">
                    <div className="user-avatar-container">
                        {user.fotoURL ? (
                            <img src={user.fotoURL} alt={user.nombre} className="user-avatar" />
                        ) : (
                            <div className="user-avatar-placeholder">
                                {user.nombre?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div className="user-profile-name">{user.nombre}</div>
                    <div className="user-profile-role">{user.rol}</div>
                    <div className="user-profile-area">Área: {user.grupoArea || user.area || 'General'}</div>
                </div>
            )}
        </div>
    );
};

export default Header;
