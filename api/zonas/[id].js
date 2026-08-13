import { query as dbQuery } from '../lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE } from '../lib/auth.js';
import { insertLogFromToken } from '../lib/audit.js';
import { ensureZonaActivoColumn } from '../lib/ensureZonaActivo.js';

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

    const zoneId = req.query?.id || req.params?.id;
    if (!zoneId) {
        return res.status(400).json({ error: 'ID requerido' });
    }

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
