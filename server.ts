import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLabCertificate } from './server/certVerifier.ts';
import type {
  CertBatchVerifyRequestItem,
  CertBatchVerifyResultItem,
} from './src/lib/certVerifyTypes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Lightweight per-IP rate limiter for external lab verification requests (60 req / min)
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
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

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/cert-verify', async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({
        error: 'Слишком много запросов к реестру сертификатов. Повторите через минуту.',
      });
      return;
    }

    const lab = typeof req.query.lab === 'string' ? req.query.lab.slice(0, 24) : 'GIA';
    const certNumber =
      typeof req.query.certNumber === 'string' ? req.query.certNumber.slice(0, 48) : '';

    try {
      const result = await verifyLabCertificate(lab, certNumber);
      res.json(result);
    } catch {
      res.status(502).json({
        error: 'Не удалось выполнить запрос к сайту лаборатории.',
      });
    }
  });

  app.post('/api/cert-verify/batch', async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({
        error: 'Превышен лимит запросов проверки сертификатов. Повторите через минуту.',
      });
      return;
    }

    const rawItems = Array.isArray(req.body?.items)
      ? (req.body.items as CertBatchVerifyRequestItem[])
      : null;

    if (!rawItems || rawItems.length === 0) {
      res.status(400).json({ error: 'Передайте список сертификатов для проверки.' });
      return;
    }

    // Cap batch size strictly to prevent server abuse
    const safeItems = rawItems.slice(0, 15).map((item) => ({
      id: typeof item?.id === 'string' ? item.id.slice(0, 120) : undefined,
      lab: typeof item?.lab === 'string' ? item.lab.slice(0, 24) : 'GIA',
      certNumber:
        typeof item?.certNumber === 'string' ? item.certNumber.slice(0, 48) : '',
    }));

    const results: CertBatchVerifyResultItem[] = new Array(safeItems.length);
    const concurrency = 3;
    let cursor = 0;

    const worker = async () => {
      while (cursor < safeItems.length) {
        const idx = cursor;
        cursor += 1;
        const item = safeItems[idx];
        const verified = await verifyLabCertificate(item.lab, item.certNumber);
        results[idx] = {
          ...verified,
          id: item.id,
        };
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, safeItems.length) }, () => worker())
    );

    res.json({ results });
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Diamonds Selector server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
