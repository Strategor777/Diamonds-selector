import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPublicCatalogMeta,
  getPublicCatalogPayload,
  invalidatePublicCatalogCache,
} from './server/publicCatalogEndpoint.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Lightweight per-IP rate limiter for public catalog API endpoints (120 req / min)
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const ipRateStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRateStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    if (ipRateStore.size > 5000) {
      ipRateStore.clear();
    }
    ipRateStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count += 1;
  return true;
}

function parseIndicesQuery(raw: unknown): number[] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const parts = raw.split(',').slice(0, 500);
  const unique = new Set<number>();
  for (const part of parts) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 5000) {
      unique.add(n);
    }
  }
  return unique.size > 0 ? Array.from(unique).sort((a, b) => a - b) : undefined;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Lightweight public client catalog metadata (public shards only, zero wholesale costs)
  app.get('/api/public/catalog/meta', async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Слишком много запросов. Повторите через минуту.' });
      return;
    }

    try {
      const meta = await getPublicCatalogMeta();
      if (!meta) {
        res.status(404).json({ error: 'Каталог ещё не опубликован.' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json(meta);
    } catch {
      res.status(502).json({ error: 'Не удалось получить метаданные каталога.' });
    }
  });

  // Lightweight public client catalog endpoint with cachedVersion early exit & incremental shard support
  app.get('/api/public/catalog', async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Слишком много запросов. Повторите через минуту.' });
      return;
    }

    const rawCachedVersion =
      typeof req.query.cachedVersion === 'string' ? Number(req.query.cachedVersion) : 0;
    const cachedVersion =
      Number.isInteger(rawCachedVersion) && rawCachedVersion > 0
        ? rawCachedVersion
        : undefined;
    const indices = parseIndicesQuery(req.query.indices);

    try {
      const payload = await getPublicCatalogPayload({ cachedVersion, indices });
      if (!payload) {
        res.status(404).json({ error: 'Каталог ещё не опубликован.' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json(payload);
    } catch {
      res.status(502).json({ error: 'Не удалось загрузить публичный каталог.' });
    }
  });

  // Lightweight cache invalidation signal triggered after admin publishes updated catalog shards
  app.post('/api/public/catalog/invalidate', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Слишком много запросов.' });
      return;
    }
    invalidatePublicCatalogCache();
    res.json({ ok: true });
  });

  const httpServer = http.createServer(app);

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr:
          process.env.DISABLE_HMR === 'true'
            ? false
            : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Diamonds Selector server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
