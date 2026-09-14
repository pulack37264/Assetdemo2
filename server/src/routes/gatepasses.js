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

function pickGatePassFields(body) {
  const referenceNumber = (body?.referenceNumber ?? body?.ReferenceNumber ?? '').toString().trim();
  const passNumber = (body?.passNumber ?? body?.PassNumber ?? '').toString().trim();
  const gatePassFrom = (body?.from ?? body?.From ?? body?.gatePassFrom ?? body?.GatePassFrom ?? '').toString().trim();
  const gatePassTo = (body?.to ?? body?.To ?? body?.gatePassTo ?? body?.GatePassTo ?? '').toString().trim();
  const productName = (body?.productName ?? body?.ProductName ?? '').toString().trim();
  const personName = (body?.personName ?? body?.PersonName ?? body?.name ?? body?.Name ?? '').toString().trim();
  const serialNumber = (body?.serialNumber ?? body?.SerialNumber ?? '').toString().trim();
  const notes = (body?.notes ?? body?.Notes ?? '').toString().trim() || null;
  const receivedBy = (body?.receivedBy ?? body?.ReceivedBy ?? '').toString().trim();
  const issuedBy = (body?.issuedBy ?? body?.IssuedBy ?? '').toString().trim();
  const passDate = (body?.date ?? body?.Date ?? body?.passDate ?? body?.PassDate ?? '').toString().trim();
  return {
    referenceNumber,
    passNumber,
    gatePassFrom,
    gatePassTo,
    productName,
    personName,
    serialNumber,
    notes,
    receivedBy,
    issuedBy,
    passDate,
  };
}

// GET /api/gatepasses - list all gate passes
router.get('/', async (_req, res, next) => {
  try {
    const db = getDbOrFail();
    const stmt = db.prepare(
      'SELECT Id, ReferenceNumber, PassNumber, GatePassFrom, GatePassTo, ProductName, PersonName, SerialNumber, Notes, ReceivedBy, IssuedBy, PassDate, CreatedAt FROM GatePasses ORDER BY CreatedAt DESC'
    );
    const rows = [];
    while (await stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    res.json({ data: rows, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/gatepasses - create gate pass
router.post('/', async (req, res, next) => {
  try {
    const {
      referenceNumber,
      passNumber,
      gatePassFrom,
      gatePassTo,
      productName,
      personName,
      serialNumber,
      notes,
      receivedBy,
      issuedBy,
      passDate,
    } = pickGatePassFields(req.body || {});
    if (
      !referenceNumber ||
      !passNumber ||
      !productName ||
      !serialNumber ||
      !receivedBy ||
      !issuedBy ||
      !passDate
    ) {
      return res.status(400).json({
        data: null,
        error: 'Reference number, pass number, product name, serial number, received by, issued by and date are required',
      });
    }
    const db = getDbOrFail();
    const stmt = db.prepare(
      'INSERT INTO GatePasses (ReferenceNumber, PassNumber, GatePassFrom, GatePassTo, ProductName, PersonName, SerialNumber, Notes, ReceivedBy, IssuedBy, PassDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    await stmt.run([
      referenceNumber,
      passNumber,
      gatePassFrom,
      gatePassTo,
      productName,
      personName,
      serialNumber,
      notes,
      receivedBy,
      issuedBy,
      passDate,
    ]);
    stmt.free();
    const idResult = await db.exec('SELECT last_insert_rowid() as id');
    const id = idResult[0].values[0][0];
    const sel = db.prepare(
      'SELECT Id, ReferenceNumber, PassNumber, GatePassFrom, GatePassTo, ProductName, PersonName, SerialNumber, Notes, ReceivedBy, IssuedBy, PassDate, CreatedAt FROM GatePasses WHERE Id = ?'
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

// PUT /api/gatepasses/:id - update gate pass
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid Reference' });
    }
    const {
      referenceNumber,
      passNumber,
      gatePassFrom,
      gatePassTo,
      productName,
      personName,
      serialNumber,
      notes,
      receivedBy,
      issuedBy,
      passDate,
    } = pickGatePassFields(req.body || {});
    if (
      !referenceNumber ||
      !passNumber ||
      !productName ||
      !serialNumber ||
      !receivedBy ||
      !issuedBy ||
      !passDate
    ) {
      return res.status(400).json({
        data: null,
        error: 'Reference number, pass number, product name, serial number, received by, issued by and date are required',
      });
    }
    const db = getDbOrFail();
    const check = db.prepare('SELECT Id FROM GatePasses WHERE Id = ?');
    check.bind([id]);
    if (!(await check.step())) {
      check.free();
      return res.status(404).json({ data: null, error: 'Gate pass not found' });
    }
    check.free();
    const stmt = db.prepare(
      'UPDATE GatePasses SET ReferenceNumber = ?, PassNumber = ?, GatePassFrom = ?, GatePassTo = ?, ProductName = ?, PersonName = ?, SerialNumber = ?, Notes = ?, ReceivedBy = ?, IssuedBy = ?, PassDate = ? WHERE Id = ?'
    );
    await stmt.run([
      referenceNumber,
      passNumber,
      gatePassFrom,
      gatePassTo,
      productName,
      personName,
      serialNumber,
      notes,
      receivedBy,
      issuedBy,
      passDate,
      id,
    ]);
    stmt.free();
    const sel = db.prepare(
      'SELECT Id, ReferenceNumber, PassNumber, GatePassFrom, GatePassTo, ProductName, PersonName, SerialNumber, Notes, ReceivedBy, IssuedBy, PassDate, CreatedAt FROM GatePasses WHERE Id = ?'
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

// DELETE /api/gatepasses/:id - delete gate pass
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid Reference' });
    }
    const db = getDbOrFail();
    const check = db.prepare('SELECT Id FROM GatePasses WHERE Id = ?');
    check.bind([id]);
    if (!(await check.step())) {
      check.free();
      return res.status(404).json({ data: null, error: 'Gate pass not found' });
    }
    check.free();
    const stmt = db.prepare('DELETE FROM GatePasses WHERE Id = ?');
    await stmt.run([id]);
    stmt.free();
    persist();
    res.json({ data: { id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;

