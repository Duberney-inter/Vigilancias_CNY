import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/** Paleta institucional (alineada a index.css) */
const BRAND = {
    red: [229, 57, 53],
    redDark: [183, 28, 28],
    ink: [13, 13, 13],
    charcoal: [33, 33, 33],
    muted: [97, 97, 97],
    line: [224, 224, 224],
    soft: [249, 249, 249],
    white: [255, 255, 255]
};

function humanizeHeader(key) {
    return String(key || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Exporta filas tabulares a PDF con estilo institucional CNY.
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} filename sin extensión
 * @param {{ title?: string, subtitle?: string, orientation?: 'landscape'|'portrait', brand?: string }} [options]
 */
export function downloadPdfTable(rows, filename, options = {}) {
    if (!rows?.length) return;

    const headers = Object.keys(rows[0]);
    const headLabels = headers.map(humanizeHeader);
    const body = rows.map((row) => headers.map((h) => {
        const v = row[h];
        if (v == null || v === '') return '—';
        return String(v);
    }));

    const colCount = headers.length;
    const orientation = options.orientation
        || (colCount >= 7 ? 'landscape' : 'portrait');

    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 12;

    const title = options.title || 'Informe';
    const subtitle = options.subtitle || '';
    const brand = options.brand || 'Sistema de Vigilancias QR · CNY';

    const drawHeader = () => {
        doc.setFillColor(...BRAND.red);
        doc.rect(0, 0, pageW, 8, 'F');
        doc.setFillColor(...BRAND.ink);
        doc.rect(0, 8, pageW, 1.2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...BRAND.redDark);
        doc.text(brand.toUpperCase(), marginX, 16);

        doc.setFontSize(16);
        doc.setTextColor(...BRAND.ink);
        doc.text(title, marginX, 24);

        let y = 28;
        if (subtitle) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...BRAND.muted);
            doc.text(subtitle, marginX, y);
            y += 4;
        }

        doc.setDrawColor(...BRAND.line);
        doc.setLineWidth(0.3);
        doc.line(marginX, y + 1, pageW - marginX, y + 1);
        return y + 4;
    };

    const startY = drawHeader();
    const fontSize = colCount >= 8 ? 7 : colCount >= 6 ? 8 : 9;

    autoTable(doc, {
        startY,
        head: [headLabels],
        body,
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize,
            cellPadding: { top: 2.2, right: 2, bottom: 2.2, left: 2 },
            textColor: BRAND.charcoal,
            lineColor: BRAND.line,
            lineWidth: 0.15,
            valign: 'middle',
            overflow: 'linebreak'
        },
        headStyles: {
            fillColor: BRAND.charcoal,
            textColor: BRAND.white,
            fontStyle: 'bold',
            fontSize: Math.min(fontSize + 0.5, 9),
            halign: 'left',
            cellPadding: { top: 3, right: 2, bottom: 3, left: 2 }
        },
        alternateRowStyles: {
            fillColor: BRAND.soft
        },
        bodyStyles: {
            fillColor: BRAND.white
        },
        margin: { left: marginX, right: marginX, top: 30, bottom: 18 },
        didDrawPage: (data) => {
            // Cabecera en páginas siguientes (la 1ª ya se dibujó antes de la tabla)
            if (data.pageNumber > 1) {
                doc.setFillColor(...BRAND.red);
                doc.rect(0, 0, pageW, 8, 'F');
                doc.setFillColor(...BRAND.ink);
                doc.rect(0, 8, pageW, 1.2, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...BRAND.ink);
                doc.text(title, marginX, 18);
            }
        }
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i);
        doc.setFillColor(...BRAND.soft);
        doc.rect(0, pageH - 14, pageW, 14, 'F');
        doc.setFillColor(...BRAND.red);
        doc.rect(0, pageH - 14, pageW, 1, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.muted);
        doc.text(brand, marginX, pageH - 6);
        doc.text(`Página ${i} de ${pageCount}`, pageW - marginX, pageH - 6, { align: 'right' });
    }

    const safeName = String(filename || 'informe').replace(/[^\w\-]+/g, '_');
    doc.save(`${safeName}.pdf`);
}
