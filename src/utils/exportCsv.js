/**
 * Exporta filas a CSV compatible con Excel en español (Windows):
 * - Separador `;`
 * - BOM UTF-8 para acentos (ñ, ó, etc.)
 * - Fechas sin comas internas
 */
export function formatDateTimeForExcel(value) {
    if (!value || value === '—') return value || '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function downloadExcelCsv(rows, filename) {
    if (!rows?.length) return;

    const headers = Object.keys(rows[0]);
    const escapeCell = (val) => {
        const str = String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
        return `"${str}"`;
    };

    const lines = [
        headers.map(escapeCell).join(';'),
        ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(';'))
    ];

    // BOM \uFEFF hace que Excel detecte UTF-8 correctamente
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
        type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Descarga una plantilla CSV vacía, con encabezados oficiales.
 */
export function downloadExcelCsvTemplate(headers, filename) {
    if (!headers?.length) return;

    const escapeCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const content = '\uFEFF' + headers.map(escapeCell).join(';') + '\r\n';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
