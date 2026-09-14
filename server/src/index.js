import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getPool, initDb, dbMiddleware } from './config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/authMiddleware.js';
import authRouter, { seedDefaultAdminIfNeeded } from './routes/auth.js';
import employeesRouter from './routes/employees.js';
import assetsRouter from './routes/assets.js';
import assignmentsRouter from './routes/assignments.js';
import repairsRouter from './routes/repairs.js';
import dashboardRouter from './routes/dashboard.js';
import invoicesRouter from './routes/invoices.js';
import licensesRouter from './routes/licenses.js';
import gatepassesRouter from './routes/gatepasses.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: in production set CORS_ORIGIN (e.g. https://yourdomain.com); otherwise allow any
app.use((req, res, next) => {
  const origin = isProduction && process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN
    : (req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Read and parse JSON body manually so it works reliably (Node fetch, PowerShell, etc.)
app.use((req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) {
    return next();
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    req.rawBody = raw;
    if (raw.length === 0) {
      req.body = {};
      return next();
    }
    for (const enc of ['utf8', 'utf16le']) {
      try {
        const text = raw.toString(enc);
        const json = JSON.parse(text);
        if (json != null && typeof json === 'object') {
          req.body = json;
          return next();
        }
      } catch (_) {}
    }
    req.body = {};
    next();
  });
  req.on('error', next);
});

// Request-scoped DB connection
app.use(dbMiddleware);

// Auth (no token required)
app.use('/api/auth', authRouter);

// Protected API (require login)
app.use('/api/employees', requireAuth, employeesRouter);
app.use('/api/assets', requireAuth, assetsRouter);
app.use('/api/assignments', requireAuth, assignmentsRouter);
app.use('/api/repairs', requireAuth, repairsRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/invoices', requireAuth, invoicesRouter);
app.use('/api/licenses', requireAuth, licensesRouter);
app.use('/api/gatepasses', requireAuth, gatepassesRouter);

// Health check (optional, no auth)
app.get('/api/health', (req, res) => {
  res.json({ data: { status: 'ok', message: 'API is running' }, error: null });
});

// DB connectivity check (no auth)
app.get('/api/health/db', async (req, res) => {
  try {
    const pool = await getPool();
    if (pool && pool.request) {
      await pool.request().query('SELECT 1');
    }
    res.json({ data: { status: 'ok', database: 'connected' }, error: null });
  } catch (err) {
    res.status(503).json({
      data: null,
      error: 'Database connection failed: ' + err.message,
    });
  }
});

// Production: serve built React app (single deployment, one port)
if (isProduction) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

async function start() {
  try {
    await initDb();
    console.log('Database ready (Microsoft SQL Server).');
    await seedDefaultAdminIfNeeded();
  } catch (err) {
    console.error('Database error:', err.message);
    process.exit(1);
  }

  const host = process.env.HOST || '0.0.0.0';
  const preferredPort = Number(process.env.PORT) || 3002;
  const candidatePorts = Array.from({ length: 10 }, (_, index) => preferredPort + index);

  const tryListen = (index) => {
    const currentPort = candidatePorts[index];
    const server = app.listen(currentPort, host, () => {
      console.log(`IT Asset Management API running at http://localhost:${currentPort}`);
      console.log(`  - Health:     GET http://localhost:${currentPort}/api/health`);
      console.log(`  - Employees:  GET/POST/PUT/DELETE http://localhost:${currentPort}/api/employees`);
      console.log(`  - Assets:     GET/POST/PUT/DELETE http://localhost:${currentPort}/api/assets`);
      console.log(`  - Assignments: POST http://localhost:${currentPort}/api/assignments (assign)`);
      console.log(`                 POST http://localhost:${currentPort}/api/assignments/return/:assetId (return)`);
      console.log(`                 GET http://localhost:${currentPort}/api/assignments/asset/:assetId (history)`);
      console.log(`  - Repairs:     GET/POST http://localhost:${currentPort}/api/repairs`);
      console.log(`                 PUT http://localhost:${currentPort}/api/repairs/:id/complete`);
      console.log(`  - Dashboard:   GET http://localhost:${currentPort}/api/dashboard/stats`);
      console.log(`  - Invoices:    GET http://localhost:${currentPort}/api/invoices`);
      console.log(`  - Asset invoice: GET http://localhost:${currentPort}/api/assets/:id/invoice (PDF)`);
      console.log(`  - Licenses:    GET/POST/PUT/DELETE http://localhost:${currentPort}/api/licenses`);
      console.log(`  - Gate passes: GET/POST/PUT/DELETE http://localhost:${currentPort}/api/gatepasses`);
      console.log(`  - Auth:        POST http://localhost:${currentPort}/api/auth/login (admin login)`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && index < candidatePorts.length - 1) {
        console.warn(`Port ${currentPort} is in use. Retrying on ${candidatePorts[index + 1]}...`);
        tryListen(index + 1);
        return;
      }
      console.error('Server error:', err.message);
      process.exit(1);
    });
  };

  tryListen(0);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
