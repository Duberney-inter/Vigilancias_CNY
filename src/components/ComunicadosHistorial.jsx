import React from 'react';
import Swal from 'sweetalert2';
import { PaginationBar, slicePage } from './PaginationBar';

const formatDestinatario = (item) => (
    item.destinatarioLabel
    || ({
        ALL: 'Todo el personal',
        DOCENTE: 'Docentes',
        'JEFE DE AREA': 'Jefes de área',
        'JEFE AREA': 'Jefes de área',
        DIRECTOR: 'Directores',
        ASISTENTE: 'Asistentes'
    }[String(item.destinatario || '').toUpperCase()] || item.destinatario || '—')
);

/**
 * Lista paginada del historial de comunicados enviados.
 */
const ComunicadosHistorial = ({
    items = [],
    loading = false,
    page = 1,
    onPageChange,
    pageSize = 8,
    showEmisor = false,
    onRefresh,
    emptyText = 'Aún no hay comunicados enviados.'
}) => {
    const pager = slicePage(items, page, pageSize);

    const openDetalle = (item) => {
        const fecha = item.timestamp
            ? new Date(item.timestamp).toLocaleString('es-CO')
            : '—';
        const mensaje = String(item.mensaje || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const lectores = Array.isArray(item.lectores) ? item.lectores : [];
        const lecturas = Number(item.lecturas || lectores.length || 0);
        const lectoresHtml = lectores.length
            ? `<ul style="margin:8px 0 0; padding-left:18px;">${lectores.map((l) => {
                const when = l.leido_en ? new Date(l.leido_en).toLocaleString('es-CO') : '';
                const name = String(l.nombre || l.documento || 'Usuario')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                return `<li style="margin-bottom:4px;"><strong>${name}</strong>${when ? ` · ${when}` : ''}</li>`;
            }).join('')}</ul>`
            : '<p style="margin:8px 0 0; color:#94a3b8;">Nadie lo ha leído aún en la app.</p>';

        Swal.fire({
            title: 'Comunicado enviado',
            width: 560,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: 'var(--color-blue-dark)',
            html: `
                <div style="text-align:left; font-size:13px; color:#334155; line-height:1.5;">
                    <p style="margin:0 0 8px;"><strong>Fecha:</strong> ${fecha}</p>
                    <p style="margin:0 0 8px;"><strong>Emisor:</strong> ${item.emisor || '—'}${item.emisor_rol ? ` (${item.emisor_rol})` : ''}</p>
                    <p style="margin:0 0 8px;"><strong>Destinatario:</strong> ${formatDestinatario(item)}</p>
                    <p style="margin:0 0 8px;"><strong>Lecturas:</strong> ${lecturas}</p>
                    <div style="margin-top:12px; padding:12px; background:#f8fafc; border-radius:8px; white-space:pre-wrap;">${mensaje}</div>
                    <div style="margin-top:14px;">
                        <strong>Quién lo leyó</strong>
                        ${lectoresHtml}
                    </div>
                </div>
            `
        });
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <div>
                    <h4 style={{ margin: 0, color: 'var(--color-blue-dark)' }}>
                        <i className="fas fa-history"></i> Historial de enviados
                    </h4>
                    <small style={{ color: '#64748b' }}>
                        {items.length} comunicado(s)
                    </small>
                </div>
                {onRefresh && (
                    <button
                        type="button"
                        className="btn btn-dark"
                        onClick={onRefresh}
                        disabled={loading}
                        style={{ margin: 0, width: 'auto', padding: '8px 12px', fontSize: '12px' }}
                    >
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i> Actualizar
                    </button>
                )}
            </div>

            {loading && items.length === 0 ? (
                <div style={{ padding: '28px', textAlign: 'center', color: '#64748b' }}>
                    <i className="fas fa-spinner fa-spin"></i> Cargando historial...
                </div>
            ) : items.length === 0 ? (
                <div style={{ padding: '28px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b' }}>
                    {emptyText}
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {pager.pageItems.map((item) => (
                            <button
                                type="button"
                                key={item.id}
                                onClick={() => openDetalle(item)}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '14px',
                                    border: '1px solid #e2e8f0',
                                    borderLeft: '4px solid #f39c12',
                                    borderRadius: '10px',
                                    background: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                    <strong style={{ color: 'var(--color-blue-dark)', fontSize: '13px' }}>
                                        Para: {formatDestinatario(item)}
                                    </strong>
                                    <small style={{ color: '#64748b' }}>
                                        {item.timestamp ? new Date(item.timestamp).toLocaleString('es-CO') : '—'}
                                    </small>
                                </div>
                                {showEmisor && (
                                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                                        Enviado por: {item.emisor || '—'}
                                        {item.emisor_rol ? ` · ${item.emisor_rol}` : ''}
                                    </div>
                                )}
                                <div style={{
                                    marginTop: '6px',
                                    color: '#475569',
                                    fontSize: '13px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {item.mensaje}
                                </div>
                                <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                                    <i className="fas fa-eye"></i>{' '}
                                    {Number(item.lecturas || (item.lectores || []).length || 0)} lectura(s)
                                    {Array.isArray(item.lectores) && item.lectores.length > 0 && (
                                        <span style={{ fontWeight: 500 }}>
                                            {' · '}
                                            {item.lectores.slice(0, 2).map((l) => l.nombre || l.documento).join(', ')}
                                            {item.lectores.length > 2 ? ` +${item.lectores.length - 2}` : ''}
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                    <PaginationBar
                        page={pager.page}
                        totalPages={pager.totalPages}
                        total={pager.total}
                        from={pager.from}
                        to={pager.to}
                        label="comunicados"
                        onPrev={() => onPageChange?.(Math.max(1, page - 1))}
                        onNext={() => onPageChange?.(Math.min(pager.totalPages, page + 1))}
                    />
                </>
            )}
        </div>
    );
};

export default ComunicadosHistorial;
