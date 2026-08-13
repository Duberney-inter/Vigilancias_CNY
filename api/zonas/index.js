import { query } from '../lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';
import { ensureZonaActivoColumn } from '../lib/ensureZonaActivo.js';

const normalizeZona = (zone) => {
    if (!zone) return zone;
    const inactive = (
        zone.activo === false
        || zone.activo === 0
        || zone.activo === '0'
        || zone.activo === 'f'
        || zone.activo === 'false'
        || zone.activo === 'FALSE'
    );
    return { ...zone, activo: !inactive };
};

const isActiveValue = (value) => !(
    value === false
    || value === 0
    || value === '0'
    || value === 'f'
    || value === 'false'
    || value === 'FALSE'
);

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;

    if (req.method === 'GET') {
        try {
            await ensureZonaActivoColumn(query);
            const { rows } = await query(`
                SELECT
                    id, alias, nombre, latitud, longitud, horario, tipo, actividad,
                    COALESCE(activo, TRUE) AS activo,
                    "createdAt", "updatedAt"
                FROM zonas
                ORDER BY nombre ASC
            `);
            return res.status(200).json(rows.map(normalizeZona));
        } catch (error) {
            console.error('Error fetching zones:', error);
            return res.status(500).json({ error: 'Error al obtener zonas', message: error.message });
        }
    }

    if (req.method === 'POST') {
        if (!requireRole(decoded, res, [ADMIN_ROLE])) return;
        try {
            await ensureZonaActivoColumn(query);
            const { alias, latitud, longitud, horario, nombre, tipo, actividad } = req.body;

            if (!alias || latitud === undefined || longitud === undefined) {
                return res.status(400).json({
                    error: 'missing-fields',
                    message: 'Alias, latitud y longitud son obligatorios'
                });
            }

            const cleanAlias = String(alias).trim().toUpperCase();
            const { rows: existingRows } = await query(
                'SELECT id, alias, activo FROM zonas WHERE alias = $1 LIMIT 1',
                [cleanAlias]
            );
            const existing = existingRows[0];

            if (existing) {
                if (!isActiveValue(existing.activo)) {
                    const { rows } = await query(`
                        UPDATE zonas
                        SET nombre = $1,
                            latitud = $2,
                            longitud = $3,
                            horario = $4,
                            tipo = $5,
                            actividad = $6,
                            activo = TRUE,
                            "updatedAt" = NOW()
                        WHERE id = $7
                        RETURNING id
                    `, [
                        nombre || cleanAlias,
                        parseFloat(latitud),
                        parseFloat(longitud),
                        horario || '06:00-18:00',
                        tipo || 'OTRO',
                        actividad || '',
                        existing.id
                    ]);

                    await insertLogFromToken(
                        decoded,
                        `Zona reactivada/actualizada: ${cleanAlias}`
                    );

                    return res.status(200).json({
                        message: `La zona ${cleanAlias} estaba inactiva y se reactivó con los datos nuevos`,
                        id: rows[0].id,
                        reactivated: true
                    });
                }

                return res.status(409).json({
                    error: 'duplicate-alias',
                    message: `Ya existe una zona con el alias ${cleanAlias}. Use otro alias o edite la zona existente.`
                });
            }

            const { rows } = await query(`
                INSERT INTO zonas (alias, nombre, latitud, longitud, horario, tipo, actividad, activo)
                VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
                RETURNING id
            `, [
                cleanAlias,
                nombre || cleanAlias,
                parseFloat(latitud),
                parseFloat(longitud),
                horario || '06:00-18:00',
                tipo || 'OTRO',
                actividad || ''
            ]);

            await insertLogFromToken(decoded, `Zona creada: ${cleanAlias}`);

            return res.status(201).json({
                message: 'Zona creada correctamente',
                id: rows[0].id
            });
        } catch (error) {
            console.error('Error creating zone:', error);
            if (error?.code === '23505') {
                return res.status(409).json({
                    error: 'duplicate-alias',
                    message: 'Ya existe una zona con ese alias. Use otro alias.'
                });
            }
            return res.status(500).json({
                error: 'Error al crear zona',
                message: error.message || 'No se pudo crear la zona'
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
