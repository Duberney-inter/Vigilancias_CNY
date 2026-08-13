// Datos de ejemplo para sembrar la base de datos local (PGlite) en desarrollo.
// Este archivo SÍ se versiona: no contiene información real de personas.
// Para usar datos reales del colegio en tu entorno local, crea `seedUsuarios.local.js`
// en esta misma carpeta (ese archivo está en .gitignore y nunca se sube al repositorio).
//
// Contraseña de prueba para todos los usuarios de ejemplo: "123456"
export const mockUsuarios = [
    {
        documento: "101",
        nombre: "ADMIN PRUEBA",
        email: "admin.prueba@example.com",
        password: "EmZ2sCZPaARlor6Bqj6E8qJ0k6sIrYVK1VE5HrXIY6Q=",
        rol: "ADMINISTRADOR GENERAL",
        fotoURL: "",
        grupoArea: "General",
        area: "General"
    },
    {
        documento: "102",
        nombre: "DIRECTOR PRUEBA",
        email: "director.prueba@example.com",
        password: "EmZ2sCZPaARlor6Bqj6E8qJ0k6sIrYVK1VE5HrXIY6Q=",
        rol: "DIRECTOR",
        fotoURL: "",
        grupoArea: "General",
        area: "General"
    },
    {
        documento: "103",
        nombre: "DOCENTE PRUEBA",
        email: "docente.prueba@example.com",
        password: "EmZ2sCZPaARlor6Bqj6E8qJ0k6sIrYVK1VE5HrXIY6Q=",
        rol: "DOCENTE",
        fotoURL: "",
        grupoArea: "Primaria",
        area: "Primaria"
    },
    {
        documento: "104",
        nombre: "JEFE AREA PRUEBA",
        email: "jefe.prueba@example.com",
        password: "EmZ2sCZPaARlor6Bqj6E8qJ0k6sIrYVK1VE5HrXIY6Q=",
        rol: "JEFE DE AREA",
        fotoURL: "",
        grupoArea: "Primaria",
        area: "Primaria"
    }
];
