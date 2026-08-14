import { query as dbQuery } from './_lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE } from './_lib/auth.js';
import { insertLogFromToken } from './_lib/audit.js';
import { ensureZonaActivoColumn } from './_lib/ensureZonaActivo.js';

// Consolidado de api/zonas/{index,[id]}.js en un solo archivo:
// el plan Hobby de Vercel limita a 12 funciones serverless por deployment.
// El enrutamiento lo hace vercel.json (?id=<uuid|alias>).

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

async function handleCollection(req, res) {
    const decoded = requireAuth(req, res);
    if (!decoded) return;

    if (req.method === 'GET') {
        try {
            await ensureZonaActivoColumn(dbQuery);
            const { rows } = await dbQuery(`
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
            await ensureZonaActivoColumn(dbQuery);
            const { alias, latitud, longitud, horario, nombre, tipo, actividad } = req.body;

            if (!alias || latitud === undefined || longitud === undefined) {
                return res.status(400).json({
                    error: 'missing-fields',
                    message: 'Alias, latitud y longitud son obligatorios'
                });
            }

            const cleanAlias = String(alias).trim().toUpperCase();
            const { rows: existingRows } = await dbQuery(
                'SELECT id, alias, activo FROM zonas WHERE alias = $1 LIMIT 1',
                [cleanAlias]
            );
            const existing = existingRows[0];

            if (existing) {
                if (!isActiveValue(existing.activo)) {
                    const { rows } = await dbQuery(`
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

            const { rows } = await dbQuery(`
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

async function handleById(req, res, zoneId) {
    const decoded = requireAuth(req, res);
    if (!decoded) return;

    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(zoneId));
    const qParam = isUUID ? String(zoneId) : String(zoneId).toUpperCase();
    const idField = isUUID ? 'id' : 'alias';

    try {
        await ensureZonaActivoColumn(dbQuery);
    } catch (error) {
        console.error('Error ensuring zonas.activo:', error);
        return res.status(500).json({
            error: 'No se pudo preparar el estado de zonas',
            message: error.message
        });
    }

    if (req.method === 'GET') {
        try {
            const { rows } = await dbQuery(
                `SELECT *, COALESCE(activo, TRUE) AS activo FROM zonas WHERE ${idField} = $1 LIMIT 1`,
                [qParam]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Zona no encontrada' });
            }
            const zone = rows[0];
            return res.status(200).json({ ...zone, activo: isActiveValue(zone.activo) });
        } catch (error) {
            console.error('Error fetching zone:', error);
            return res.status(500).json({ error: 'Error al obtener zona' });
        }
    }

    if (req.method === 'PUT') {
        if (!requireRole(decoded, res, [ADMIN_ROLE])) return;
        try {
            const body = req.body || {};
            const bodyKeys = Object.keys(body).filter((k) => body[k] !== undefined);
            const onlyActivo = bodyKeys.length === 1 && bodyKeys[0] === 'activo';

            if (onlyActivo) {
                const wantActive = isActiveValue(body.activo);
                const { rows } = await dbQuery(
                    `SELECT id, alias, activo FROM zonas WHERE ${idField} = $1 LIMIT 1`,
                    [qParam]
                );
                const zone = rows[0];
                if (!zone) {
                    return res.status(404).json({ error: 'Zona no encontrada' });
                }

                const { rows: updated } = await dbQuery(
                    `UPDATE zonas
                     SET activo = $1, "updatedAt" = NOW()
                     WHERE ${idField} = $2
                     RETURNING id, alias, activo`,
                    [wantActive, qParam]
                );

                await insertLogFromToken(
                    decoded,
                    wantActive
                        ? `Zona reactivada: ${zone.alias || qParam}`
                        : `Zona desactivada: ${zone.alias || qParam}`
                );

                return res.status(200).json({
                    message: wantActive ? 'Zona reactivada' : 'Zona desactivada',
                    id: updated[0]?.id || zone.id,
                    activo: wantActive
                });
            }

            const updateData = { ...body };
            delete updateData.id;

            const fields = [];
            const values = [];
            let i = 1;
            for (const [key, value] of Object.entries(updateData)) {
                if (value === undefined) continue;
                fields.push(`"${key}" = $${i}`);
                values.push(value);
                i++;
            }

            if (fields.length === 0) {
                return res.status(400).json({ error: 'No data to update' });
            }

            fields.push(`"updatedAt" = NOW()`);
            values.push(qParam);

            const updateQStr = `UPDATE zonas SET ${fields.join(', ')} WHERE ${idField} = $${i} RETURNING *`;
            const { rows } = await dbQuery(updateQStr, values);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Zona no encontrada' });
            }

            await insertLogFromToken(decoded, `Zona editada: ${rows[0]?.alias || qParam}`);
            return res.status(200).json({ message: 'Zona actualizada correctamente' });
        } catch (error) {
            console.error('Error updating zone:', error);
            return res.status(500).json({ error: 'Error al actualizar zona', message: error.message });
        }
    }

    if (req.method === 'DELETE') {
        if (!requireRole(decoded, res, [ADMIN_ROLE])) return;
        try {
            const { rows } = await dbQuery(
                `SELECT id, alias, activo FROM zonas WHERE ${idField} = $1 LIMIT 1`,
                [qParam]
            );
            const zone = rows[0];
            if (!zone) {
                return res.status(404).json({ error: 'Zona no encontrada' });
            }
            if (!isActiveValue(zone.activo)) {
                return res.status(200).json({
                    message: 'La zona ya estaba inactiva',
                    id: zone.id,
                    activo: false
                });
            }

            const { rows: updated } = await dbQuery(
                `UPDATE zonas
                 SET activo = FALSE, "updatedAt" = NOW()
                 WHERE ${idField} = $1
                 RETURNING id, alias, activo`,
                [qParam]
            );

            await insertLogFromToken(decoded, `Zona desactivada: ${zone.alias || qParam}`);

            return res.status(200).json({
                message: 'Zona desactivada. Su historial se conserva.',
                id: updated[0]?.id || zone.id,
                activo: false
            });
        } catch (error) {
            console.error('Error deactivating zone:', error);
            return res.status(500).json({ error: 'Error al desactivar la zona', message: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const { id } = req.query;

    if (id) return handleById(req, res, id);
    return handleCollection(req, res);
}
