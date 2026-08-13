import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { changePassword, createLog } from '../lib/api';

const showAlert = (options) =>
    Swal.fire({
        ...options,
        didOpen: (el) => {
            const container = Swal.getContainer();
            if (container) container.style.zIndex = '10000';
            if (typeof options.didOpen === 'function') options.didOpen(el);
        }
    });

const ChangePasswordModal = ({ user, isOpen, onClose }) => {
    const [currentPass, setCurrentPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!currentPass.trim()) {
            return showAlert({ icon: 'error', title: 'Error', text: 'Debe ingresar su contraseña actual' });
        }

        if (newPass !== confirmPass) {
            return showAlert({ icon: 'error', title: 'Error', text: 'Las contraseñas no coinciden' });
        }

        if (newPass.length < 6) {
            return showAlert({ icon: 'error', title: 'Error', text: 'La contraseña debe tener al menos 6 caracteres' });
        }

        if (currentPass === newPass) {
            return showAlert({ icon: 'error', title: 'Error', text: 'La nueva contraseña debe ser diferente a la actual' });
        }

        setLoading(true);
        try {
            await changePassword(newPass, undefined, currentPass.trim());

            try {
                await createLog({
                    usuario: user.nombre,
                    documento: user.documento || user.uid,
                    accion: "Cambio de contraseña exitoso"
                });
            } catch (err) {
                console.error("Error al registrar log de cambio de contraseña:", err);
            }

            setCurrentPass('');
            setNewPass('');
            setConfirmPass('');
            await showAlert({ icon: 'success', title: '¡Éxito!', text: 'Contraseña actualizada correctamente' });
            onClose();
        } catch (error) {
            console.error("Error updating password:", error);
            let message = 'No se pudo actualizar la contraseña';
            if (error.code === 'invalid-current-password') {
                message = 'La contraseña actual es incorrecta';
            } else if (error.code === 'current-password-required') {
                message = 'Debe ingresar su contraseña actual';
            } else if (error.message) {
                message = error.message;
            }
            await showAlert({ icon: 'error', title: 'Error', text: message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 4000
        }}>
            <div className="card" style={{ maxWidth: '400px', width: '90%', animation: 'fadeIn 0.3s ease' }}>
                <h3 style={{ color: 'var(--color-blue-dark)' }}>Gestionar Contraseña</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-light)', marginBottom: '20px' }}>
                    Ingrese su contraseña actual y la nueva contraseña.
                </p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="password"
                        placeholder="Contraseña Actual"
                        value={currentPass}
                        onChange={(e) => setCurrentPass(e.target.value)}
                        required
                        autoComplete="current-password"
                    />
                    <input
                        type="password"
                        placeholder="Nueva Contraseña"
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    <input
                        type="password"
                        placeholder="Confirmar Nueva Contraseña"
                        value={confirmPass}
                        onChange={(e) => setConfirmPass(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                        <button type="submit" className="btn btn-green" disabled={loading} style={{ margin: 0 }}>
                            {loading ? 'Guardando...' : 'Actualizar'}
                        </button>
                        <button type="button" className="btn btn-dark" onClick={onClose} disabled={loading} style={{ margin: 0 }}>
                            Cancelar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
