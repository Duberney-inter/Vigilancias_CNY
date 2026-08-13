import { query } from '../lib/db.js';
import { handleCors, requireAuth, requireRole, ADMIN_ROLE, DIRECTOR_ROLE, isSupervisorRole } from '../lib/auth.js';
import nodemailer from 'nodemailer';
import { insertLogFromToken } from '../lib/audit.js';

const COMMUNICATION_READER_ROLES = [
    ADMIN_ROLE,
    DIRECTOR_ROLE,
    'ASISTENTE',
    'DOCENTE',
    'JEFE DE AREA'
];

const normalizeTarget = (value) => {
    const target = String(value || 'ALL').trim().toUpperCase();
    return target === 'JEFE AREA' ? 'JEFE DE AREA' : target;
};

const isDbTrue = (value) => (
    value === true
    || value === 1
    || value === '1'
    || value === 't'
    || value === 'true'
    || value === 'TRUE'
);

const canReadCommunication = (communication, decoded) => {
    if (isSupervisorRole(decoded.rol)) return true;

    const target = normalizeTarget(communication.destinatario);
    const role = normalizeTarget(decoded.rol);
    const document = String(decoded.documento || decoded.uid || '').trim().toUpperCase();
    const name = String(decoded.nombre || '').trim().toUpperCase();

    return target === 'ALL'
        || target === role
        || target === document
        || target === name;
};

const ensureReadTable = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS comunicado_lecturas (
            comunicado_id UUID NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
            usuario_documento TEXT NOT NULL,
            leido_en TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (comunicado_id, usuario_documento)
        )
    `);
};

const ensureSenderColumns = async () => {
    await query(`ALTER TABLE comunicados ADD COLUMN IF NOT EXISTS emisor_documento TEXT`);
    await query(`ALTER TABLE comunicados ADD COLUMN IF NOT EXISTS emisor_rol TEXT`);
};

const labelDestinatario = (value) => {
    const target = normalizeTarget(value);
    if (target === 'ALL') return 'Todo el personal';
    if (target === 'DOCENTE') return 'Docentes';
    if (target === 'JEFE DE AREA') return 'Jefes de área';
    if (target === 'DIRECTOR') return 'Directores';
    if (target === 'ASISTENTE') return 'Asistentes';
    return String(value || '—');
};

export default async function handler(req, res) {
    if (handleCors(req, res)) return;

    const decoded = requireAuth(req, res);
    if (!decoded) return;

    if (req.method === 'GET') {
        if (!requireRole(decoded, res, COMMUNICATION_READER_ROLES)) return;
        try {
            await ensureReadTable();
            await ensureSenderColumns();
            const document = String(decoded.documento || decoded.uid || '').trim();
            const nombre = String(decoded.nombre || '').trim();
            const scope = String(req.query?.scope || '').trim().toLowerCase();

            if (scope === 'enviados') {
                if (!requireRole(decoded, res, [ADMIN_ROLE, DIRECTOR_ROLE])) return;

                const isAdmin = String(decoded.rol || '') === ADMIN_ROLE;
                const { rows } = await query(`
                    SELECT
                        c.*,
                        (
                            SELECT COUNT(*)::int
                            FROM comunicado_lecturas cl
                            WHERE cl.comunicado_id::text = c.id::text
                        ) AS lecturas
                    FROM comunicados c
                    WHERE (
                        $1::boolean = TRUE
                        OR c.emisor_documento = $2
                        OR (
                            (c.emisor_documento IS NULL OR TRIM(c.emisor_documento) = '')
                            AND LOWER(TRIM(COALESCE(c.emisor, ''))) = LOWER($3)
                        )
                    )
                    ORDER BY c.timestamp DESC
                `, [isAdmin, document, nombre]);

                const ids = rows.map((row) => String(row.id));
                let lectoresById = {};
                if (ids.length > 0) {
                    const idSet = new Set(ids);
                    const { rows: lecturaRows } = await query(`
                        SELECT
                            cl.comunicado_id::text AS comunicado_id,
                            cl.usuario_documento,
                            cl.leido_en,
                            u.nombre
                        FROM comunicado_lecturas cl
                        LEFT JOIN usuarios u ON u.documento = cl.usuario_documento
                        ORDER BY cl.leido_en DESC
                    `);

                    lectoresById = lecturaRows.reduce((acc, row) => {
                        const key = String(row.comunicado_id);
                        if (!idSet.has(key)) return acc;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push({
                            documento: row.usuario_documento,
                            nombre: row.nombre || row.usuario_documento,
                            leido_en: row.leido_en
                        });
                        return acc;
                    }, {});
                }

                return res.status(200).json(rows.map((row) => {
                    const lectores = lectoresById[String(row.id)] || [];
                    return {
                        ...row,
                        lecturas: Number(row.lecturas || lectores.length || 0),
                        lectores,
                        destinatarioLabel: labelDestinatario(row.destinatario)
                    };
                }));
            }

            const { rows } = await query(`
                SELECT
                    c.*,
                    (cl.comunicado_id IS NOT NULL) AS leido,
                    cl.leido_en
                FROM comunicados c
                LEFT JOIN comunicado_lecturas cl
                    ON cl.comunicado_id::text = c.id::text
                    AND cl.usuario_documento = $1
                ORDER BY c.timestamp DESC
            `, [document]);

            return res.status(200).json(
                rows
                    .filter((communication) => canReadCommunication(communication, decoded))
                    .map((communication) => ({
                        ...communication,
                        leido: isDbTrue(communication.leido)
                    }))
            );
        } catch (error) {
            console.error('Error fetching comunicados:', error);
            return res.status(500).json({ error: 'Error al obtener comunicados' });
        }
    }

    if (req.method === 'PUT') {
        if (!requireRole(decoded, res, COMMUNICATION_READER_ROLES)) return;
        try {
            const { id } = req.body || {};
            if (!id) {
                return res.status(400).json({ error: 'Se requiere el identificador del comunicado' });
            }

            await ensureReadTable();
            const { rows } = await query(
                'SELECT * FROM comunicados WHERE id = $1 LIMIT 1',
                [id]
            );
            const communication = rows[0];

            if (!communication) {
                return res.status(404).json({ error: 'Comunicado no encontrado' });
            }
            if (!canReadCommunication(communication, decoded)) {
                return res.status(403).json({ error: 'No tiene acceso a este comunicado' });
            }

            const document = String(decoded.documento || decoded.uid || '').trim();
            if (!document) {
                return res.status(400).json({
                    error: 'missing-document',
                    message: 'No se pudo identificar al usuario para registrar la lectura'
                });
            }

            await query(`
                INSERT INTO comunicado_lecturas (comunicado_id, usuario_documento, leido_en)
                VALUES ($1::uuid, $2, NOW())
                ON CONFLICT (comunicado_id, usuario_documento)
                DO UPDATE SET leido_en = EXCLUDED.leido_en
            `, [String(id), document]);

            const { rows: countRows } = await query(
                `SELECT COUNT(*)::int AS total
                 FROM comunicado_lecturas
                 WHERE comunicado_id::text = $1`,
                [String(id)]
            );

            return res.status(200).json({
                message: 'Comunicado marcado como leído',
                lecturas: Number(countRows[0]?.total || 0)
            });
        } catch (error) {
            console.error('Error marking comunicado as read:', error);
            return res.status(500).json({ error: 'No se pudo marcar el comunicado como leído' });
        }
    }

    if (req.method === 'POST') {
        if (!requireRole(decoded, res, [ADMIN_ROLE, DIRECTOR_ROLE])) return;
        try {
            await ensureSenderColumns();
            const { mensaje, emisor, destinatario } = req.body;

            if (!mensaje) {
                return res.status(400).json({ error: 'Mensaje requerido' });
            }

            const targetDest = destinatario || 'ALL';
            const emisorNombre = emisor || decoded.nombre || 'Sistema';
            const emisorDocumento = String(decoded.documento || decoded.uid || '').trim();
            const emisorRol = String(decoded.rol || '').trim();

            const { rows } = await query(`
                INSERT INTO comunicados (mensaje, emisor, destinatario, emisor_documento, emisor_rol)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [
                mensaje,
                emisorNombre,
                targetDest,
                emisorDocumento || null,
                emisorRol || null
            ]);

            // Enviar correos por SMTP
            try {
                let emailsQuery = '';
                let queryParams = [];

                if (targetDest === 'ALL') {
                    emailsQuery = `SELECT email, nombre FROM usuarios WHERE email IS NOT NULL AND email != ''`;
                } else if (targetDest === 'DOCENTE') {
                    emailsQuery = `SELECT email, nombre FROM usuarios WHERE rol = 'DOCENTE' AND email IS NOT NULL AND email != ''`;
                } else if (targetDest === 'JEFE AREA' || targetDest === 'JEFE DE AREA') {
                    emailsQuery = `SELECT email, nombre FROM usuarios WHERE rol = 'JEFE DE AREA' AND email IS NOT NULL AND email != ''`;
                } else {
                    // Buscar coincidencia por nombre o documento
                    emailsQuery = `SELECT email, nombre FROM usuarios WHERE (nombre = $1 OR documento = $1) AND email IS NOT NULL AND email != ''`;
                    queryParams = [targetDest];
                }

                const { rows: usersWithEmail } = await query(emailsQuery, queryParams);

                if (usersWithEmail.length > 0) {
                    const smtpHost = process.env.SMTP_HOST;
                    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
                    const smtpUser = process.env.SMTP_USER || 'soporte@colegionuevayork.edu.co';
                    const smtpPass = process.env.SMTP_PASS;
                    const smtpSecure = process.env.SMTP_SECURE === 'true';

                    if (smtpHost && smtpPass) {
                        const transporter = nodemailer.createTransport({
                            host: smtpHost,
                            port: smtpPort,
                            secure: smtpSecure,
                            auth: {
                                user: smtpUser,
                                pass: smtpPass
                            },
                            tls: {
                                rejectUnauthorized: false
                            }
                        });

                        const mailPromises = usersWithEmail.map(user => {
                            const mailOptions = {
                                from: `"Soporte Colegio Nueva York" <${smtpUser}>`,
                                to: user.email,
                                subject: `Nuevo Comunicado de ${emisorNombre || 'Dirección'}`,
                                html: `
                                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                                        <div style="text-align: center; border-bottom: 2px solid #6ab04c; padding-bottom: 10px; margin-bottom: 20px;">
                                            <h2 style="color: #2c3e50; margin: 0;">Colegio Nueva York</h2>
                                            <p style="color: #6ab04c; margin: 5px 0 0 0; font-weight: bold; font-size: 14px; text-transform: uppercase;">Notificaciones de Vigilancia</p>
                                        </div>
                                        <div style="padding: 10px 0;">
                                            <p style="font-size: 16px; color: #333;">Hola <strong>${user.nombre}</strong>,</p>
                                            <p style="font-size: 15px; color: #555; line-height: 1.6; background-color: #f9f9f9; padding: 15px; border-left: 4px solid #6ab04c; border-radius: 4px;">
                                                ${mensaje.replace(/\n/g, '<br/>')}
                                            </p>
                                            <p style="font-size: 13px; color: #777; margin-top: 25px;">
                                                Emitido por: <strong>${emisorNombre || 'Dirección'}</strong>
                                            </p>
                                        </div>
                                        <div style="text-align: center; border-top: 1px solid #eee; padding-top: 15px; margin-top: 30px; font-size: 11px; color: #aaa;">
                                            Este es un correo automático. Por favor no responda a este mensaje.<br/>
                                            Vigilancias QR CNY Preescolar © 2026
                                        </div>
                                    </div>
                                `
                            };
                            return transporter.sendMail(mailOptions);
                        });

                        await Promise.all(mailPromises);
                        console.log(`[SMTP] Correos enviados con éxito a ${usersWithEmail.length} destinatarios.`);
                    } else {
                        console.warn('[SMTP] No se enviaron correos porque las variables SMTP_HOST o SMTP_PASS no están configuradas.');
                    }
                }
            } catch (mailError) {
                console.error('[SMTP] Error al enviar los correos:', mailError);
            }

            await insertLogFromToken(
                decoded,
                `Comunicado enviado (destinatario: ${targetDest})`
            );

            return res.status(201).json({
                message: 'Comunicado enviado',
                id: rows[0].id
            });
        } catch (error) {
            console.error('Error creating comunicado:', error);
            return res.status(500).json({ error: 'Error al enviar comunicado' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
