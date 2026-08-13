import React, { useState, useEffect, useCallback } from 'react';

/**
 * Divide una lista en páginas.
 * @param {unknown[]} items
 * @param {number} pageSize
 * @param {string|number} [resetKey] al cambiar, vuelve a la página 1
 */
export function usePagination(items, pageSize = 10, resetKey = '') {
    const [page, setPage] = useState(1);
    const list = Array.isArray(items) ? items : [];
    const size = Math.max(1, pageSize || 10);
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / size) || 1);
    const safePage = Math.min(Math.max(1, page), totalPages);

    useEffect(() => {
        setPage(1);
    }, [resetKey]);

    useEffect(() => {
        if (page !== safePage) setPage(safePage);
    }, [page, safePage]);

    const goPrev = useCallback(() => {
        setPage((p) => Math.max(1, p - 1));
    }, []);

    const goNext = useCallback(() => {
        setPage((p) => Math.min(totalPages, p + 1));
    }, [totalPages]);

    const goTo = useCallback((n) => {
        const next = Number(n);
        if (!Number.isFinite(next)) return;
        setPage(Math.min(totalPages, Math.max(1, Math.floor(next))));
    }, [totalPages]);

    const pageItems = list.slice((safePage - 1) * size, safePage * size);

    return {
        page: safePage,
        setPage,
        goPrev,
        goNext,
        goTo,
        pageSize: size,
        total,
        totalPages,
        pageItems,
        from: total === 0 ? 0 : (safePage - 1) * size + 1,
        to: Math.min(safePage * size, total)
    };
}

/** Utilidad sin hooks (para funciones render internas). */
export function slicePage(items, page, pageSize = 10) {
    const list = Array.isArray(items) ? items : [];
    const size = Math.max(1, pageSize || 10);
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / size) || 1);
    const safePage = Math.min(Math.max(1, page || 1), totalPages);
    return {
        page: safePage,
        pageSize: size,
        total,
        totalPages,
        pageItems: list.slice((safePage - 1) * size, safePage * size),
        from: total === 0 ? 0 : (safePage - 1) * size + 1,
        to: Math.min(safePage * size, total)
    };
}

/**
 * Barra de paginación. No usa clase .btn (width:100% rompe el layout).
 */
export function PaginationBar({
    page,
    totalPages,
    total,
    from,
    to,
    onPrev,
    onNext,
    label = 'registros',
    alwaysShow = false
}) {
    if (!total) return null;
    if (!alwaysShow && totalPages <= 1) return null;

    const btnStyle = (disabled) => ({
        margin: 0,
        width: 'auto',
        minWidth: '110px',
        padding: '8px 14px',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
        background: disabled ? '#f1f5f9' : '#fff',
        color: disabled ? '#94a3b8' : '#0f172a',
        fontWeight: 700,
        fontSize: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        boxShadow: 'none',
        textTransform: 'none',
        opacity: disabled ? 0.75 : 1
    });

    return (
        <div
            className="pagination-bar"
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #e2e8f0',
                width: '100%'
            }}
        >
            <button
                type="button"
                disabled={page <= 1}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (page > 1) onPrev?.();
                }}
                style={btnStyle(page <= 1)}
            >
                <i className="fas fa-chevron-left"></i> Anterior
            </button>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textAlign: 'center', flex: '1 1 160px' }}>
                {from}–{to} de {total} {label} · Pág. {page}/{totalPages}
            </span>
            <button
                type="button"
                disabled={page >= totalPages}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (page < totalPages) onNext?.();
                }}
                style={btnStyle(page >= totalPages)}
            >
                Siguiente <i className="fas fa-chevron-right"></i>
            </button>
        </div>
    );
}
