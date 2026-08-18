/**
 * Ciclo semanal fijo de vigilancias: Lunes a Viernes, sin fecha de anclaje
 * (cada semana calendario reinicia el ciclo). Sábados y domingos no tienen
 * día de ciclo (fin de semana).
 */
const WEEKDAY_TO_CICLO = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }; // 0=Dom, 6=Sáb -> sin ciclo

/** Convierte una fecha (Date o string) a clave local "YYYY-MM-DD". */
export function toDateKeyLocal(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Día de ciclo (1=Lunes..5=Viernes) para una fecha, o null si es fin de semana. */
export function getDiaCiclo(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return WEEKDAY_TO_CICLO[d.getDay()] ?? null;
}

/**
 * Lista los días hábiles (lunes a viernes) entre `from` y `to` (inclusive),
 * cada uno con su clave de fecha local y su día de ciclo.
 */
export function listSchoolDays(from, to) {
    const days = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= end.getTime()) {
        const diaCiclo = getDiaCiclo(cursor);
        if (diaCiclo != null) {
            days.push({ key: toDateKeyLocal(cursor), diaCiclo });
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}
