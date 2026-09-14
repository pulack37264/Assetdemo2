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

// GET /api/repairs - list all repairs
router.get('/', async (_req, res, next) => {
  try {
    const db = getDbOrFail();
    const stmt = db.prepare(`
      SELECT r.Id, r.AssetId, r.IssueDescription, r.RepairVendor, r.Cost, r.Status, r.StartDate, r.CompletedDate,
             a.Name AS AssetName, a.SerialNumber AS AssetSerial
      FROM Repairs r
      JOIN Assets a ON a.Id = r.AssetId
      ORDER BY r.StartDate DESC
    `);
    const rows = [];
    while (await stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    res.json({ data: rows, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/repairs - create repair (sets asset status to In Repair)
router.post('/', async (req, res, next) => {
  try {
    const assetId = Number(req.body?.assetId ?? req.body?.AssetId);
    const issueDescription = (req.body?.issueDescription ?? req.body?.IssueDescription ?? '').toString().trim();
    const repairVendor = (req.body?.repairVendor ?? req.body?.RepairVendor ?? '').toString().trim() || null;
    const cost = req.body?.cost != null ? Number(req.body.cost) : req.body?.Cost != null ? Number(req.body.Cost) : null;

    if (!assetId || !issueDescription) {
      return res.status(400).json({
        data: null,
        error: 'assetId and issueDescription are required',
      });
    }

    const db = getDbOrFail();

    const check = db.prepare('SELECT Id, Status FROM Assets WHERE Id = ?');
    check.bind([assetId]);
    const asset = (await check.step()) ? check.getAsObject() : null;
    check.free();
    if (!asset) {
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }

    const ins = db.prepare(
      'INSERT INTO Repairs (AssetId, IssueDescription, RepairVendor, Cost, Status) VALUES (?, ?, ?, ?, ?)'
    );
    await ins.run([assetId, issueDescription, repairVendor, cost, 'Pending']);
    ins.free();

    const upd = db.prepare('UPDATE Assets SET Status = ? WHERE Id = ?');
    await upd.run(['In Repair', assetId]);
    upd.free();

    const idResult = await db.exec('SELECT last_insert_rowid() as id');
    const id = idResult[0].values[0][0];
    const sel = db.prepare(`
      SELECT r.Id, r.AssetId, r.IssueDescription, r.RepairVendor, r.Cost, r.Status, r.StartDate, r.CompletedDate
      FROM Repairs r WHERE r.Id = ?
    `);
    sel.bind([id]);
    const row = (await sel.step()) ? sel.getAsObject() : null;
    sel.free();
    persist();
    res.status(201).json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// PUT /api/repairs/:id/complete - complete repair (sets asset back to Available)
router.put('/:id/complete', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid repair ID' });
    }
    const db = getDbOrFail();

    const sel = db.prepare('SELECT Id, AssetId, Status FROM Repairs WHERE Id = ?');
    sel.bind([id]);
    const repair = (await sel.step()) ? sel.getAsObject() : null;
    sel.free();
    if (!repair) {
      return res.status(404).json({ data: null, error: 'Repair not found' });
    }
    if (repair.Status === 'Completed') {
      return res.status(409).json({ data: null, error: 'Repair is already completed' });
    }

    const now = new Date().toISOString();
    const updRepair = db.prepare('UPDATE Repairs SET Status = ?, CompletedDate = ? WHERE Id = ?');
    await updRepair.run(['Completed', now, id]);
    updRepair.free();

    const updAsset = db.prepare('UPDATE Assets SET Status = ? WHERE Id = ?');
    await updAsset.run(['Available', repair.AssetId]);
    updAsset.free();

    persist();
    res.json({
      data: { Id: id, Status: 'Completed', CompletedDate: now, AssetId: repair.AssetId },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
