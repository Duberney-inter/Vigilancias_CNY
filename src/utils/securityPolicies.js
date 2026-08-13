import Swal from 'sweetalert2';

/**
 * Muestra las políticas de seguridad y uso de datos (todos los roles).
 */
export function showSecurityPolicies() {
    return Swal.fire({
        title: 'Políticas de Seguridad y Uso de Datos',
        icon: 'info',
        width: 640,
        confirmButtonText: 'Entendido',
        confirmButtonColor: 'var(--color-green-primary)',
        html: `
            <div style="text-align: left; font-size: 14px; line-height: 1.55; color: #334155;">
                <p style="margin-bottom: 14px;">
                    Al usar el <strong>Sistema de Vigilancias QR CNY</strong>, el colegio informa que se tratarán
                    los siguientes datos para el control de rondas escolares:
                </p>
                <ul style="padding-left: 18px; margin: 0 0 14px 0;">
                    <li style="margin-bottom: 10px;">
                        <strong>GPS / ubicación:</strong> se solicita acceso a la ubicación del dispositivo
                        para validar que el registro se realice cerca de la zona asignada y para la
                        supervisión.
                    </li>
                    <li style="margin-bottom: 10px;">
                        <strong>Información personal:</strong> nombre, documento, correo, rol y área
                        se usan para autenticación, asignación de turnos y gestión de usuarios.
                    </li>
                    <li style="margin-bottom: 10px;">
                        <strong>Registro de actividad:</strong> se guardan vigilancias, novedades,
                        comunicados y llevar un control de las acciones realizadas en el sistema.
                    </li>
                </ul>
                <p style="margin-bottom: 10px; padding: 12px; background: #f8fafc; border-left: 4px solid #6ab04c; border-radius: 6px;">
                    Estos datos se emplean únicamente con fines institucionales de seguridad escolar.
                    Las sesiones expiran cada 8 horas.
                </p>
                <p style="margin: 0; font-size: 12px; color: #64748b;">
                    El uso del sistema implica el conocimiento de estas políticas. Ante dudas, consulte
                    a la administración del colegio.
                </p>
            </div>
        `
    });
}
