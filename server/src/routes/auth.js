import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDb } from '../config/db.js';
import { getPool } from '../config/db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function getDbOrFail() {
  try {
    return getDb();
  } catch {
    throw new Error('Database not initialized');
  }
}

/** GET /api/auth/need-setup - no auth, returns { needSetup: true } when no admins exist */
router.get('/need-setup', async (req, res, next) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.Admins');
    const count = r.recordset?.[0]?.cnt ?? 0;
    return res.json({
      data: { needSetup: count === 0 },
      error: null,
    });
  } catch (err) {
    console.error('[auth] need-setup error:', err.message);
    return res.json({ data: { needSetup: true }, error: null });
  }
});

/** POST /api/auth/setup - create first admin when table is empty (no auth) */
router.post('/setup', async (req, res, next) => {
  try {
    const username = (req.body?.username ?? req.body?.Username ?? '').toString().trim();
    const password = (req.body?.password ?? req.body?.Password ?? '').toString();
    if (!username || !password) {
      return res.status(400).json({ data: null, error: 'Username and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ data: null, error: 'Password must be at least 6 characters' });
    }

    const pool = await getPool();
    const r = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.Admins');
    const count = r.recordset?.[0]?.cnt ?? 0;
    if (count > 0) {
      return res.status(403).json({ data: null, error: 'Admin already exists. Use the login form.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.request()
      .input('username', username)
      .input('hash', hash)
      .query('INSERT INTO dbo.Admins (Username, PasswordHash) VALUES (@username, @hash)');
    console.log('[auth] First admin created:', username);

    const token = jwt.sign(
      { sub: username, username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    return res.json({
      data: { token, user: { username } },
      error: null,
    });
  } catch (err) {
    console.error('[auth] setup error:', err.message);
    next(err);
  }
});

/** POST /api/auth/login - username, password -> { token, user: { username } } */
router.post('/login', async (req, res, next) => {
  try {
    const username = (req.body?.username ?? req.body?.Username ?? '').toString().trim();
    const password = (req.body?.password ?? req.body?.Password ?? '').toString();
    if (!username || !password) {
      return res.status(400).json({ data: null, error: 'Username and password are required' });
    }

    const db = getDbOrFail();
    const stmt = db.prepare('SELECT Id, Username, PasswordHash FROM Admins WHERE Username = ?');
    stmt.bind([username]);
    const admin = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();

    if (!admin) {
      console.warn('[auth] Login failed: no user found for username:', username);
      return res.status(401).json({ data: null, error: 'Invalid username or password' });
    }

    const match = await bcrypt.compare(password, admin.PasswordHash);
    if (!match) {
      console.warn('[auth] Login failed: wrong password for username:', username);
      return res.status(401).json({ data: null, error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { sub: admin.Id, username: admin.Username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      data: { token, user: { username: admin.Username } },
      error: null,
    });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    next(err);
  }
});

/** GET /api/auth/me - require Bearer token -> { user: { username } } */
router.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ data: null, error: 'Not authenticated' });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ data: null, error: 'Invalid or expired token' });
    }

    return res.json({
      data: { user: { username: payload.username } },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

/** Seed default admin if Admins table is empty and ADMIN_USERNAME/ADMIN_PASSWORD are set. Call from startup. */
export async function seedDefaultAdminIfNeeded() {
  const pool = await getPool();
  const r = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.Admins');
  const count = r.recordset?.[0]?.cnt ?? 0;
  if (count > 0) return;

  const adminUser = process.env.ADMIN_USERNAME?.trim();
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminUser || !adminPass) return;

  const hash = await bcrypt.hash(adminPass, 10);
  await pool.request()
    .input('username', adminUser)
    .input('hash', hash)
    .query(
      `INSERT INTO dbo.Admins (Username, PasswordHash) VALUES (@username, @hash)`
    );
  console.log('[auth] Seeded default admin:', adminUser);
}

export default router;
