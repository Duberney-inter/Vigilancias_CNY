import React from 'react';

/**
 * Resuelve el valor de "destinatario" que se envía a la API según el tipo
 * de envío elegido. Para INDIVIDUAL se usa el nombre del usuario (así lo
 * compara api/comunicados/index.js: por nombre o por documento).
 */
export function resolveComunicadoDestinatario(target, selectedUser) {
    return target === 'INDIVIDUAL' ? selectedUser : target;
}

const ComunicadoDestinatarioSelect = ({
    target,
    onTargetChange,
    selectedUser,
    onSelectedUserChange,
    users = []
}) => (
    <>
        <label>Enviar a:</label>
        <select value={target} onChange={(e) => onTargetChange(e.target.value)}>
            <option value="ALL">Todo el Personal</option>
            <option value="DOCENTE">Todos los Docentes</option>
            <option value="JEFE DE AREA">Todos los Jefes de Área</option>
            <option value="INDIVIDUAL">Usuario Específico</option>
        </select>

        {target === 'INDIVIDUAL' && (
            <>
                <label>Seleccionar Usuario:</label>
                <select value={selectedUser} onChange={(e) => onSelectedUserChange(e.target.value)}>
                    <option value="">Seleccione un usuario...</option>
                    {[...users]
                        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
                        .map((u) => (
                            <option key={u.id || u.documento} value={u.nombre}>{u.nombre} ({u.rol})</option>
                        ))}
                </select>
            </>
        )}
    </>
);

export default ComunicadoDestinatarioSelect;
