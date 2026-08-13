import React, { useEffect, useMemo, useState } from 'react';
import { getHorarios, getRegistros, getUsuarios, getZonas } from '../lib/api';
import { downloadExcelCsv, formatDateTimeForExcel } from '../utils/exportCsv';
import { downloadPdfTable } from '../utils/exportPdf';
import { PaginationBar, usePagination } from './PaginationBar';

const toDateKey = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        return String(value).slice(0, 10);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const startOfDay = (dateStr) => new Date(`${dateStr}T00:00:00`);
const endOfDay = (dateStr) => new Date(`${dateStr}T23:59:59.999`);

/**
 * Informe: quién sí / quién no realizó vigilancia en un periodo.
 */
const CumplimientoVigilancias = ({ onBack }) => {
    const today = toDateKey(new Date());
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [registros, setRegistros] = useState([]);
    const [zones, setZones] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [period, setPeriod] = useState('today'); // today | yesterday | last7 | range
    const [dateFrom, setDateFrom] = useState(today);
    const [dateTo, setDateTo] = useState(today);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState('todos'); // todos | si | no
    const [rolFilter, setRolFilter] = useState('ALL');
    const [areaFilter, setAreaFilter] = useState('ALL');

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [regs, us, zs, hs] = await Promise.all([
                    getRegistros(),
                    getUsuarios(),
                    getZonas(),
                    getHorarios()
                ]);
                setRegistros(regs || []);
                setUsers(us || []);
                setZones(zs || []);
                setHorarios(hs || []);
            } catch (e) {
                console.error('Error cargando informe de cumplimiento:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const range = useMemo(() => {
        if (period === 'today') {
            return { from: startOfDay(today), to: endOfDay(today), label: `Hoy (${today})` };
        }
        if (period === 'yesterday') {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            const key = toDateKey(y);
            return { from: startOfDay(key), to: endOfDay(key), label: `Ayer (${key})` };
        }
        if (period === 'last7') {
            const from = new Date();
            from.setDate(from.getDate() - 6);
            from.setHours(0, 0, 0, 0);
            return { from, to: endOfDay(today), label: 'Últimos 7 días' };
        }

        let fromKey = dateFrom || today;
        let toKey = dateTo || today;
        if (fromKey > toKey) {
            const tmp = fromKey;
            fromKey = toKey;
            toKey = tmp;
        }
        return {
            from: startOfDay(fromKey),
            to: endOfDay(toKey),
            label: fromKey === toKey ? `Fecha ${fromKey}` : `Desde ${fromKey} hasta ${toKey}`
        };
    }, [period, dateFrom, dateTo, today]);

    const isOpenDay = useMemo(() => {
        if (period === 'today') return true;
        if (period === 'range') {
            const fromKey = dateFrom <= dateTo ? dateFrom : dateTo;
            const toKey = dateFrom <= dateTo ? dateTo : dateFrom;
            return toKey === today && fromKey <= today;
        }
        return false;
    }, [period, dateFrom, dateTo, today]);

    const pendingLabel = isOpenDay ? 'AÚN NO' : 'NO CUMPLIÓ';
    const pendingLabelShort = isOpenDay ? 'Aún no' : 'No cumplieron';

    const teachers = useMemo(() => {
        const assignedDocs = new Set(
            (horarios || [])
                .filter((h) => h.zonaId)
                .map((h) => String(h.usuarioId))
        );
        return (users || []).filter((u) => {
            const isVigilante = u.rol === 'DOCENTE' || u.rol === 'JEFE DE AREA';
            const doc = String(u.documento || u.uid || '');
            return isVigilante && assignedDocs.has(doc);
        });
    }, [users, horarios]);

    const zoneById = useMemo(() => {
        const map = {};
        (zones || []).forEach((z) => {
            map[String(z.id)] = z;
            if (z.alias) map[String(z.alias).toUpperCase()] = z;
        });
        return map;
    }, [zones]);

    const reportRows = useMemo(() => {
        const inRange = (registros || []).filter((r) => {
            const t = new Date(r.timestamp).getTime();
            return !Number.isNaN(t) && t >= range.from.getTime() && t <= range.to.getTime();
        });

        return teachers.map((teacher) => {
            const doc = String(teacher.documento || teacher.uid || '');
            const name = teacher.nombre || '';
            const mine = inRange.filter((r) =>
                String(r.usuarioId || '') === doc ||
                (r.usuarioNombre && name && r.usuarioNombre === name)
            );
            const sorted = [...mine].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const last = sorted[0];
            const lastZone = last
                ? (zoneById[String(last.zonaId)] || zoneById[String(last.zonaAlias || '').toUpperCase()])
                : null;

            const assignedZones = (horarios || [])
                .filter((h) => String(h.usuarioId) === doc && h.zonaId)
                .map((h) => zoneById[String(h.zonaId)]?.alias || zoneById[String(h.zonaId)]?.nombre || h.zonaId);

            const uniqueAssigned = [...new Set(assignedZones)];
            const cumplio = mine.length > 0;

            return {
                documento: doc,
                nombre: name,
                rol: teacher.rol,
                area: teacher.grupoArea || teacher.area || '',
                cumplio,
                estado: cumplio ? 'SÍ CUMPLIÓ' : pendingLabel,
                cantidad: mine.length,
                ultimaHora: last ? formatDateTimeForExcel(last.timestamp) : '—',
                ultimaZona: lastZone?.nombre || last?.zonaAlias || '—',
                zonasAsignadasCiclo: uniqueAssigned.length ? uniqueAssigned.join(', ') : 'Sin asignación en ciclo'
            };
        }).sort((a, b) => {
            if (a.cumplio !== b.cumplio) return a.cumplio ? -1 : 1;
            return a.nombre.localeCompare(b.nombre);
        });
    }, [teachers, registros, range, zoneById, horarios, pendingLabel]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return reportRows.filter((row) => {
            if (tab === 'si' && !row.cumplio) return false;
            if (tab === 'no' && row.cumplio) return false;
            if (rolFilter !== 'ALL' && row.rol !== rolFilter) return false;
            if (areaFilter !== 'ALL' && (row.area || '') !== areaFilter) return false;
            if (!term) return true;
            return (
                row.nombre.toLowerCase().includes(term) ||
                row.documento.includes(term) ||
                row.rol.toLowerCase().includes(term) ||
                (row.area || '').toLowerCase().includes(term)
            );
        });
    }, [reportRows, search, tab, rolFilter, areaFilter]);

    const tablePager = usePagination(
        filtered,
        10,
        `${search}|${tab}|${rolFilter}|${areaFilter}|${period}|${dateFrom}|${dateTo}`
    );

    const stats = useMemo(() => {
        const si = reportRows.filter((r) => r.cumplio).length;
        const no = reportRows.length - si;
        const pct = reportRows.length ? Math.round((si / reportRows.length) * 100) : 0;
        return { total: reportRows.length, si, no, pct };
    }, [reportRows]);

    const buildExportRows = () => filtered.map((r) => ({
        Documento: r.documento,
        Nombre: r.nombre,
        Rol: r.rol,
        Area: r.area,
        Estado: r.estado,
        Cantidad_Vigilancias: r.cantidad,
        Ultima_Vigilancia: r.ultimaHora,
        Ultima_Zona: r.ultimaZona,
        Periodo: range.label
    }));

    const exportCsv = () => {
        const rows = buildExportRows();
        if (!rows.length) return;
        downloadExcelCsv(rows, `cumplimiento_vigilancias_${toDateKey(new Date())}`);
    };

    const exportPdf = () => {
        const rows = buildExportRows();
        if (!rows.length) return;
        downloadPdfTable(rows, `cumplimiento_vigilancias_${toDateKey(new Date())}`, {
            title: 'Cumplimiento de Vigilancias',
            subtitle: `${range.label} · Generado ${formatDateTimeForExcel(new Date())}`
        });
    };

    if (loading) {
        return (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                <span className="loading-spinner" style={{ borderTopColor: 'var(--color-green-primary)', borderColor: 'rgba(0,0,0,0.1)' }}></span>
                <p style={{ color: 'var(--text-light)', marginTop: '10px' }}>Generando informe de cumplimiento...</p>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 20px' }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px',
                background: 'white', padding: '15px 25px', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <button className="btn btn-back" onClick={onBack} style={{ margin: 0 }}>
                        <i className="fas fa-arrow-left"></i> Volver al Inicio
                    </button>
                    <div>
                        <h2 style={{ margin: 0, color: 'var(--color-blue-dark)', fontSize: '20px', fontWeight: '800' }}>
                            Cumplimiento de Vigilancias
                        </h2>
                        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
                            Cumplimiento · {range.label}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-green" onClick={exportCsv} style={{ margin: 0, width: 'auto' }}>
                        <i className="fas fa-file-csv"></i> Cumplimiento CSV
                    </button>
                    <button className="btn btn-dark" onClick={exportPdf} style={{ margin: 0, width: 'auto' }}>
                        <i className="fas fa-file-pdf"></i> Cumplimiento PDF
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '15px' }}>
                <div className="admin-kpi-card registros" style={{ margin: 0 }}>
                    <h2 className="admin-kpi-value">{stats.total}</h2>
                    <span className="admin-kpi-label">Con asignación</span>
                </div>
                <div className="admin-kpi-card zonas" style={{ margin: 0 }}>
                    <h2 className="admin-kpi-value">{stats.si}</h2>
                    <span className="admin-kpi-label">Sí cumplieron</span>
                </div>
                <div className="admin-kpi-card" style={{
                    margin: 0,
                    background: isOpenDay
                        ? 'linear-gradient(135deg, #f39c12, #e67e22)'
                        : 'linear-gradient(135deg, #e74c3c, #c0392b)',
                    color: 'white'
                }}>
                    <h2 className="admin-kpi-value" style={{ color: 'white' }}>{stats.no}</h2>
                    <span className="admin-kpi-label" style={{ color: 'rgba(255,255,255,0.9)' }}>{pendingLabelShort}</span>
                </div>
                <div className="admin-kpi-card kpis" style={{ margin: 0 }}>
                    <h2 className="admin-kpi-value">{stats.pct}%</h2>
                    <span className="admin-kpi-label">% Cumplimiento</span>
                </div>
            </div>

            <div className="card" style={{ margin: 0, padding: '20px', textAlign: 'left' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end' }}>
                    <div style={{ minWidth: '180px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Periodo</label>
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: '600' }}
                        >
                            <option value="today">Hoy</option>
                            <option value="yesterday">Ayer</option>
                            <option value="last7">Últimos 7 días</option>
                            <option value="range">Rango libre (desde–hasta)</option>
                        </select>
                    </div>
                    {period === 'range' && (
                        <>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Desde</label>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    max={dateTo || today}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: '600' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Hasta</label>
                                <input
                                    type="date"
                                    value={dateTo}
                                    min={dateFrom || undefined}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: '600' }}
                                />
                            </div>
                        </>
                    )}
                    <div style={{ flex: 1, minWidth: '220px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Buscar</label>
                        <input
                            type="text"
                            placeholder="Nombre, documento, rol o área..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', margin: 0 }}
                        />
                    </div>
                    <div style={{ minWidth: '160px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Rol</label>
                        <select
                            value={rolFilter}
                            onChange={(e) => setRolFilter(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: '600' }}
                        >
                            <option value="ALL">Todos</option>
                            {[...new Set(reportRows.map((r) => r.rol).filter(Boolean))].sort().map((rol) => (
                                <option key={rol} value={rol}>{rol}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ minWidth: '160px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Área</label>
                        <select
                            value={areaFilter}
                            onChange={(e) => setAreaFilter(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: '600' }}
                        >
                            <option value="ALL">Todas</option>
                            {[...new Set(reportRows.map((r) => r.area).filter(Boolean))].sort().map((area) => (
                                <option key={area} value={area}>{area}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <button
                            type="button"
                            className="btn btn-back"
                            onClick={() => {
                                setSearch('');
                                setRolFilter('ALL');
                                setAreaFilter('ALL');
                                setTab('todos');
                                setPeriod('today');
                            }}
                            style={{ margin: 0, width: 'auto', whiteSpace: 'nowrap' }}
                        >
                            <i className="fas fa-filter-circle-xmark"></i> Limpiar
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                    {[
                        { id: 'todos', label: `Todos (${stats.total})` },
                        { id: 'si', label: `Sí cumplieron (${stats.si})` },
                        { id: 'no', label: `${pendingLabelShort} (${stats.no})` }
                    ].map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className="btn"
                            style={{
                                margin: 0,
                                width: 'auto',
                                padding: '8px 14px',
                                background: tab === t.id ? 'var(--color-blue-dark)' : '#e2e8f0',
                                color: tab === t.id ? 'white' : '#334155',
                                fontWeight: '700',
                                fontSize: '12px'
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card" style={{ margin: 0, padding: '20px', textAlign: 'left' }}>
                <div className="table-container" style={{ maxHeight: '520px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                    <table className="mini-table" style={{ margin: 0 }}>
                        <thead>
                            <tr style={{ background: 'linear-gradient(135deg, var(--color-blue-dark), var(--color-blue-light))' }}>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Estado</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Docente</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Rol / Área</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Cantidad</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Última vigilancia</th>
                                <th style={{ color: 'white', padding: '12px 15px' }}>Última zona</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tablePager.total === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontWeight: '600' }}>
                                        No hay resultados para el filtro seleccionado.
                                    </td>
                                </tr>
                            ) : (
                                tablePager.pageItems.map((row) => (
                                    <tr key={row.documento}>
                                        <td style={{ padding: '12px 15px' }}>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '999px',
                                                fontSize: '11px',
                                                fontWeight: '800',
                                                background: row.cumplio
                                                    ? 'rgba(46, 204, 113, 0.15)'
                                                    : (isOpenDay ? 'rgba(243, 156, 18, 0.18)' : 'rgba(231, 76, 60, 0.15)'),
                                                color: row.cumplio
                                                    ? '#1e8449'
                                                    : (isOpenDay ? '#b9770e' : '#c0392b')
                                            }}>
                                                {row.estado}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 15px' }}>
                                            <div style={{ fontWeight: '700', color: '#1e293b' }}>{row.nombre}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b' }}>Doc. {row.documento}</div>
                                        </td>
                                        <td style={{ padding: '12px 15px', fontSize: '13px', color: '#475569' }}>
                                            <div style={{ fontWeight: '700' }}>{row.rol}</div>
                                            <div>{row.area || '—'}</div>
                                        </td>
                                        <td style={{ padding: '12px 15px', fontWeight: '800', color: 'var(--color-blue-dark)' }}>
                                            {row.cantidad}
                                        </td>
                                        <td style={{ padding: '12px 15px', fontSize: '13px', color: '#334155' }}>
                                            {row.ultimaHora}
                                        </td>
                                        <td style={{ padding: '12px 15px', fontSize: '13px', fontWeight: '600', color: 'var(--color-blue-dark)' }}>
                                            {row.ultimaZona}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <PaginationBar
                    page={tablePager.page}
                    totalPages={tablePager.totalPages}
                    total={tablePager.total}
                    from={tablePager.from}
                    to={tablePager.to}
                    label="docentes"
                    onPrev={tablePager.goPrev}
                    onNext={tablePager.goNext}
                />
                <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    Solo se listan docentes/jefes con zona asignada en horarios.
                    {isOpenDay
                        ? ' En el día actual: “SÍ CUMPLIÓ” o “AÚN NO” (el día todavía no termina).'
                        : ' En historial: “SÍ CUMPLIÓ” o “NO CUMPLIÓ”.'}
                </p>
            </div>
        </div>
    );
};

export default CumplimientoVigilancias;
