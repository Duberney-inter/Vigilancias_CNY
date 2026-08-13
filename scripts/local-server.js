import express from 'express';
import cors from 'cors';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { readdir, stat } from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const API_DIR = join(__dirname, '..', 'api');
const PORT = 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Logger middleware
app.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.url}`);
    next();
});

async function registerRoutes(dir) {
    const files = await readdir(dir);

    for (const file of files) {
        const fullPath = join(dir, file);
        const s = await stat(fullPath);

        if (s.isDirectory()) {
            await registerRoutes(fullPath);
        } else if (file.endsWith('.js')) {
            // Convert file path to route
            let relativePath = relative(API_DIR, fullPath);

            // Handle Vercel dynamic routes [id].js -> :id
            let route = '/' + relativePath.replace(/\\/g, '/')
                .replace(/\[([^\]]+)\]/g, ':$1')
                .replace(/\.js$/, '')
                .replace(/\/index$/, '');

            if (route === '/index') route = '/';

            // Skip helper files in lib/ or other non-endpoint directories if they don't export a function
            if (relativePath.replace(/\\/g, '/').includes('lib/')) {
                console.log(`Skipping library file: ${relativePath}`);
                continue;
            }

            try {
                // Import the handler
                const fileUrl = pathToFileURL(fullPath).href;
                const module = await import(fileUrl);
                const handler = module.default;

                if (typeof handler === 'function') {
                    console.log(`Registering route: ${route}`);

                    // Support both /api/path and /path
                    const fullRoute = `/api${route === '/' ? '' : route}`;

                    app.all([route, fullRoute], async (req, res) => {
                        try {
                            await handler(req, res);
                        } catch (err) {
                            console.error(`Error in handler ${route}:`, err);
                            if (!res.headersSent) {
                                res.status(500).json({ error: 'Internal Server Error', message: err.message });
                            }
                        }
                    });
                }
            } catch (err) {
                console.error(`Failed to register route ${route}:`, err);
            }
        }
    }
}

async function start() {
    // Esperar DB lista antes de aceptar tráfico (evita 404/errores por API a medias).
    const { query } = await import('../api/lib/db.js');
    await query('SELECT 1');
    const { ensureZonaActivoColumn } = await import('../api/lib/ensureZonaActivo.js');
    await ensureZonaActivoColumn(query);
    console.log('[API] Base de datos lista para recibir peticiones.');

    await registerRoutes(API_DIR);

    app.use((req, res) => {
        res.status(404).json({ error: 'Not Found', message: `Route ${req.url} not found in local API server` });
    });

    const server = app.listen(PORT, () => {
        console.log(`\n🚀 Local API Server running at http://localhost:${PORT}`);
        console.log(`   Proxied from Vite at http://localhost:5173/api\n`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[API] El puerto ${PORT} ya está en uso.`);
            console.error('[API] Cierre el otro Node/API y vuelva a ejecutar: npm run dev:all');
            process.exit(1);
        }
        console.error('[API] Error del servidor:', err);
        process.exit(1);
    });
}

start().catch((err) => {
    console.error('[API] No se pudo iniciar el servidor local:', err);
    process.exit(1);
});
