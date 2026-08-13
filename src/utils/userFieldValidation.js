const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOMBRE_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '\-.][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
const DOCUMENTO_REGEX = /^\d{5,15}$/;
const GRUPO_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+(?:[ .\-_/][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+)*$/;

export function sanitizeNombreInput(value) {
    return String(value || '').replace(/[0-9]/g, '');
}

export function sanitizeDocumentoInput(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 15);
}

export function isValidGrupo(grupo) {
    const clean = String(grupo || '').trim();
    if (!clean) return true;
    return GRUPO_REGEX.test(clean);
}

export function isValidEmail(email) {
    return EMAIL_REGEX.test(String(email || '').trim());
}

export function isValidNombre(nombre) {
    const clean = String(nombre || '').trim().replace(/\s+/g, ' ');
    if (!clean) return false;
    if (/\d/.test(clean)) return false;
    return NOMBRE_REGEX.test(clean);
}

export function isValidDocumento(documento) {
    return DOCUMENTO_REGEX.test(String(documento || '').trim());
}

/**
 * Valida campos de usuario. Devuelve el primer mensaje de error o ''.
 */
export function getUsuarioFieldError({ nombre, documento, email, grupo } = {}) {
    const cleanNombre = String(nombre || '').trim().replace(/\s+/g, ' ');
    const cleanDocumento = String(documento || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanGrupo = String(grupo || '').trim();

    if (!cleanNombre) return 'El nombre es obligatorio';
    if (/\d/.test(cleanNombre)) return 'El nombre no puede contener números';
    if (!NOMBRE_REGEX.test(cleanNombre)) {
        return 'El nombre solo puede contener letras, espacios, apóstrofes o guiones';
    }
    if (cleanNombre.length < 3) return 'El nombre debe tener al menos 3 caracteres';

    if (!cleanDocumento) return 'El documento es obligatorio';
    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(cleanDocumento)) {
        return 'El documento no puede contener letras';
    }
    if (/\D/.test(cleanDocumento)) {
        return 'El documento solo puede contener números';
    }
    if (!DOCUMENTO_REGEX.test(cleanDocumento)) {
        return 'El documento debe tener entre 5 y 15 dígitos';
    }

    if (!cleanEmail) return 'El correo electrónico es obligatorio';
    if (!EMAIL_REGEX.test(cleanEmail)) {
        return 'El correo electrónico no tiene un formato válido';
    }

    if (cleanGrupo && !GRUPO_REGEX.test(cleanGrupo)) {
        return 'El grupo/área tiene caracteres no permitidos';
    }

    return '';
}
