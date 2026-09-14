import { Router } from 'express';
import { getDb, persist } from '../config/db.js';

const router = Router();

function getDbOrFail() {
  try {
    return getDb();
  } catch {
    throw new Error('Database not initialized');
  }
}

function pickLicenseFields(body) {
  const name = (body?.name ?? body?.Name ?? '').toString().trim();
  const vendor = (body?.vendor ?? body?.Vendor ?? '').toString().trim();
  const purchaseDate = (body?.purchaseDate ?? body?.PurchaseDate ?? '').toString().trim();
  const expiryDate = (body?.expiryDate ?? body?.ExpiryDate ?? '').toString().trim();
  const rawCost = (body?.cost ?? body?.Cost ?? '').toString().trim();
  const cost = rawCost === '' ? NaN : Number(rawCost);
  return { name, vendor, purchaseDate, expiryDate, cost };
}

// GET /api/licenses - list all software licenses
router.get('/', async (_req, res, next) => {
  try {
    const db = getDbOrFail();
    const stmt = db.prepare(
      'SELECT Id, Name, Vendor, PurchaseDate, ExpiryDate, Cost, CreatedAt FROM SoftwareLicenses ORDER BY PurchaseDate DESC, Name'
    );
    const rows = [];
    while (await stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    res.json({ data: rows, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/licenses - create software license
router.post('/', async (req, res, next) => {
  try {
    const { name, vendor, purchaseDate, expiryDate, cost } = pickLicenseFields(req.body || {});
    if (!name || !vendor || !purchaseDate || !expiryDate) {
      return res.status(400).json({
        data: null,
        error: 'Name, vendor, purchase date and expiry date are required',
      });
    }
    if (Number.isNaN(cost)) {
      return res.status(400).json({
        data: null,
        error: 'Cost is required and must be a number',
      });
    }
    const db = getDbOrFail();
    const stmt = db.prepare(
      'INSERT INTO SoftwareLicenses (Name, Vendor, PurchaseDate, ExpiryDate, Cost) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run([name, vendor, purchaseDate, expiryDate, cost]);
    stmt.free();
    const idResult = await db.exec('SELECT last_insert_rowid() as id');
    const id = idResult[0].values[0][0];
    const sel = db.prepare(
      'SELECT Id, Name, Vendor, PurchaseDate, ExpiryDate, Cost, CreatedAt FROM SoftwareLicenses WHERE Id = ?'
    );
    sel.bind([id]);
    const row = (await sel.step()) ? sel.getAsObject() : null;
    sel.free();
    persist();
    res.status(201).json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// PUT /api/licenses/:id - update license
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid license ID' });
    }
    const { name, vendor, purchaseDate, expiryDate, cost } = pickLicenseFields(req.body || {});
    if (!name || !vendor || !purchaseDate || !expiryDate) {
      return res.status(400).json({
        data: null,
        error: 'Name, vendor, purchase date and expiry date are required',
      });
    }
    if (Number.isNaN(cost)) {
      return res.status(400).json({
        data: null,
        error: 'Cost is required and must be a number',
      });
    }
    const db = getDbOrFail();
    const check = db.prepare('SELECT Id FROM SoftwareLicenses WHERE Id = ?');
    check.bind([id]);
    if (!(await check.step())) {
      check.free();
      return res.status(404).json({ data: null, error: 'License not found' });
    }
    check.free();

    const stmt = db.prepare(
      'UPDATE SoftwareLicenses SET Name = ?, Vendor = ?, PurchaseDate = ?, ExpiryDate = ?, Cost = ? WHERE Id = ?'
    );
    await stmt.run([name, vendor, purchaseDate, expiryDate, cost, id]);
    stmt.free();
    const sel = db.prepare(
      'SELECT Id, Name, Vendor, PurchaseDate, ExpiryDate, Cost, CreatedAt FROM SoftwareLicenses WHERE Id = ?'
    );
    sel.bind([id]);
    const row = (await sel.step()) ? sel.getAsObject() : null;
    sel.free();
    persist();
    res.json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/licenses/:id - delete license
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid license ID' });
    }
    const db = getDbOrFail();
    const check = db.prepare('SELECT Id FROM SoftwareLicenses WHERE Id = ?');
    check.bind([id]);
    if (!(await check.step())) {
      check.free();
      return res.status(404).json({ data: null, error: 'License not found' });
    }
    check.free();
    const stmt = db.prepare('DELETE FROM SoftwareLicenses WHERE Id = ?');
    await stmt.run([id]);
    stmt.free();
    persist();
    res.json({ data: { id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;

