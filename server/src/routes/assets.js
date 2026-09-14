import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb, persist, isUniqueConstraintError, isForeignKeyConstraintError } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INVOICES_DIR = path.join(__dirname, '..', '..', 'data', 'invoices');

function ensureInvoicesDir() {
  if (!fs.existsSync(INVOICES_DIR)) fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

const pdfOnly = (_req, file, cb) => {
  const ok = file.mimetype === 'application/pdf' || (file.originalname || '').toLowerCase().endsWith('.pdf');
  cb(null, !!ok);
};

const uploadInvoice = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: pdfOnly,
});

// Optional invoice for create asset (multipart): store in memory, write after we have the new id
const createWithOptionalInvoice = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: pdfOnly,
}).single('invoice');

const router = Router();

function getDbOrFail() {
  try {
    return getDb();
  } catch {
    throw new Error('Database not initialized');
  }
}

function pickAssetFields(body) {
  const name = (body?.name ?? body?.Name ?? '').toString().trim();
  const type = (body?.type ?? body?.Type ?? '').toString().trim();
  const serialNumber = (body?.serialNumber ?? body?.SerialNumber ?? '').toString().trim();
  const status = (body?.status ?? body?.Status ?? 'Available').toString().trim();
  const vendor = (body?.vendor ?? body?.Vendor ?? '').toString().trim();
  const purchaseDate = (body?.purchaseDate ?? body?.PurchaseDate ?? '').toString().trim();
  const warrantyExpiry = (body?.warrantyExpiry ?? body?.WarrantyExpiry ?? '').toString().trim() || null;
  return { name, type, serialNumber, status, vendor, purchaseDate, warrantyExpiry };
}

const VALID_TYPES = ['Laptop', 'Desktop', 'Monitor', 'Printer', 'Network Equipment', 'Other'];
const VALID_STATUS = ['Available', 'Assigned', 'In Repair', 'Retired'];
const ASSET_SELECT_FIELDS = `
  a.Id,
  a.Name,
  a.Type,
  a.SerialNumber,
  a.Status,
  a.Vendor,
  a.PurchaseDate,
  a.WarrantyExpiry,
  COALESCE(i.StoredPath, a.InvoicePath) AS InvoicePath,
  COALESCE(i.InvoiceNumber, a.InvoiceNumber) AS InvoiceNumber,
  a.InvoiceId,
  a.AssignedToId,
  a.AddedAt
`;

async function getAssetById(db, id) {
  const stmt = db.prepare(`
    SELECT ${ASSET_SELECT_FIELDS}
    FROM Assets a
    LEFT JOIN Invoices i ON i.Id = a.InvoiceId
    WHERE a.Id = ?
  `);
  stmt.bind([id]);
  const row = (await stmt.step()) ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

async function getInvoiceById(db, invoiceId) {
  const stmt = db.prepare(`
    SELECT Id, AssetId, InvoiceNumber, OriginalFileName, StoredPath, UploadedAt
    FROM Invoices
    WHERE Id = ?
  `);
  stmt.bind([invoiceId]);
  const row = (await stmt.step()) ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

async function getInvoiceByNumber(db, invoiceNumber) {
  const stmt = db.prepare(`
    SELECT TOP 1 Id, AssetId, InvoiceNumber, OriginalFileName, StoredPath, UploadedAt
    FROM Invoices
    WHERE InvoiceNumber = ?
    ORDER BY UploadedAt DESC, Id DESC
  `);
  stmt.bind([invoiceNumber]);
  const row = (await stmt.step()) ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

async function getAssetInvoiceLink(db, assetId) {
  const stmt = db.prepare(`
    SELECT Id, InvoiceId, InvoicePath, InvoiceNumber
    FROM Assets
    WHERE Id = ?
  `);
  stmt.bind([assetId]);
  const row = (await stmt.step()) ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function deleteInvoiceFile(storedPath) {
  if (!storedPath) return;
  const filePath = path.join(INVOICES_DIR, storedPath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function cleanupOrphanInvoice(db, invoiceLink) {
  if (!invoiceLink) return;

  if (invoiceLink.InvoiceId) {
    const countStmt = db.prepare('SELECT COUNT(*) AS n FROM Assets WHERE InvoiceId = ?');
    countStmt.bind([invoiceLink.InvoiceId]);
    const countRow = (await countStmt.step()) ? countStmt.getAsObject() : { n: 0 };
    countStmt.free();

    if (Number(countRow?.n ?? 0) === 0) {
      const invoice = await getInvoiceById(db, invoiceLink.InvoiceId);
      const deleteStmt = db.prepare('DELETE FROM Invoices WHERE Id = ?');
      await deleteStmt.run([invoiceLink.InvoiceId]);
      deleteStmt.free();
      deleteInvoiceFile(invoice?.StoredPath || invoiceLink.InvoicePath);
    }
    return;
  }

  // Backward-compatible cleanup for legacy assets that only stored a file path on the asset row.
  deleteInvoiceFile(invoiceLink.InvoicePath);
}

async function createInvoiceRecord(db, assetId, file, invoiceNumber) {
  ensureInvoicesDir();
  const originalName = (file.originalname || 'invoice.pdf').toString();

  const insInv = db.prepare(
    'INSERT INTO Invoices (AssetId, InvoiceNumber, OriginalFileName, StoredPath, UploadedAt) VALUES (?, ?, ?, ?, datetime(\'now\'))'
  );
  await insInv.run([assetId, invoiceNumber, originalName, '']);
  insInv.free();

  const idResult = await db.exec('SELECT last_insert_rowid() as id');
  const invoiceId = idResult[0].values[0][0];
  const filename = `invoice-${invoiceId}.pdf`;
  fs.writeFileSync(path.join(INVOICES_DIR, filename), file.buffer);

  const updInv = db.prepare('UPDATE Invoices SET StoredPath = ? WHERE Id = ?');
  await updInv.run([filename, invoiceId]);
  updInv.free();

  return { invoiceId, filename, originalName };
}

// GET /api/assets - list all assets
router.get('/', async (_req, res, next) => {
  try {
    const db = getDbOrFail();
    const stmt = db.prepare(`
      SELECT ${ASSET_SELECT_FIELDS}
      FROM Assets a
      LEFT JOIN Invoices i ON i.Id = a.InvoiceId
      ORDER BY a.Name
    `);
    const rows = [];
    while (await stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    res.json({ data: rows, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:id/invoice - download invoice PDF
router.get('/:id/invoice', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid asset ID' });
    }
    const db = getDbOrFail();
    const stmt = db.prepare(`
      SELECT
        a.InvoiceId,
        a.InvoicePath AS LegacyInvoicePath,
        a.InvoiceNumber AS LegacyInvoiceNumber,
        i.StoredPath,
        i.InvoiceNumber
      FROM Assets a
      LEFT JOIN Invoices i ON i.Id = a.InvoiceId
      WHERE a.Id = ?
    `);
    stmt.bind([id]);
    const row = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();
    const storedPath = row?.StoredPath || row?.LegacyInvoicePath || null;
    if (!row || !storedPath) {
      return res.status(404).json({ data: null, error: 'No invoice for this asset' });
    }
    const filePath = path.join(INVOICES_DIR, storedPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ data: null, error: 'Invoice file not found' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(path.resolve(filePath));
  } catch (err) {
    next(err);
  }
});

// POST /api/assets/:id/invoice - upload invoice PDF
router.post('/:id/invoice', uploadInvoice.single('invoice'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid asset ID' });
    }
    if (!req.file) {
      return res.status(400).json({ data: null, error: 'No PDF file uploaded. Send a file with field name "invoice".' });
    }
    const db = getDbOrFail();
    const check = db.prepare('SELECT Id FROM Assets WHERE Id = ?');
    check.bind([id]);
    if (!(await check.step())) {
      check.free();
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }
    check.free();
    const previousInvoiceLink = await getAssetInvoiceLink(db, id);
    const invoiceNumber = (req.body?.invoiceNumber ?? req.body?.invoice_number ?? '').toString().trim() || null;
    const { invoiceId, filename } = await createInvoiceRecord(db, id, req.file, invoiceNumber);
    const stmt = db.prepare('UPDATE Assets SET InvoiceId = ?, InvoicePath = ?, InvoiceNumber = ? WHERE Id = ?');
    await stmt.run([invoiceId, filename, invoiceNumber, id]);
    stmt.free();
    await cleanupOrphanInvoice(db, previousInvoiceLink);
    persist();
    const row = await getAssetById(db, id);
    res.status(200).json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/assets/:id/invoice - remove invoice from an asset
router.delete('/:id/invoice', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid asset ID' });
    }

    const db = getDbOrFail();
    const asset = await getAssetInvoiceLink(db, id);
    if (!asset) {
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }
    if (!asset.InvoiceId && !asset.InvoicePath) {
      return res.status(404).json({ data: null, error: 'No invoice attached to this asset' });
    }

    const update = db.prepare('UPDATE Assets SET InvoiceId = NULL, InvoicePath = NULL, InvoiceNumber = NULL WHERE Id = ?');
    await update.run([id]);
    update.free();

    await cleanupOrphanInvoice(db, asset);
    persist();

    const row = await getAssetById(db, id);
    res.status(200).json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/assets/invoice-links - link one invoice to many assets
router.post('/invoice-links', async (req, res, next) => {
  try {
    const invoiceId = parseInt((req.body?.invoiceId ?? '').toString(), 10);
    const assetIds = Array.isArray(req.body?.assetIds)
      ? [...new Set(req.body.assetIds.map((value) => parseInt(String(value), 10)).filter((value) => Number.isInteger(value) && value > 0))]
      : [];

    if (!Number.isInteger(invoiceId) || invoiceId < 1) {
      return res.status(400).json({ data: null, error: 'A valid invoiceId is required' });
    }
    if (assetIds.length === 0) {
      return res.status(400).json({ data: null, error: 'Select at least one asset to link this invoice' });
    }

    const db = getDbOrFail();
    const invoice = await getInvoiceById(db, invoiceId);
    if (!invoice) {
      return res.status(404).json({ data: null, error: 'Invoice not found' });
    }

    for (const assetId of assetIds) {
      const check = db.prepare('SELECT Id FROM Assets WHERE Id = ?');
      check.bind([assetId]);
      const exists = await check.step();
      check.free();
      if (!exists) {
        return res.status(404).json({ data: null, error: `Asset ${assetId} not found` });
      }
    }

    const update = db.prepare('UPDATE Assets SET InvoiceId = ?, InvoicePath = ?, InvoiceNumber = ? WHERE Id = ?');
    for (const assetId of assetIds) {
      await update.run([invoiceId, invoice.StoredPath, invoice.InvoiceNumber, assetId]);
    }
    update.free();

    persist();

    const updatedAssets = [];
    for (const assetId of assetIds) {
      updatedAssets.push(await getAssetById(db, assetId));
    }

    res.status(200).json({ data: updatedAssets, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/assets/:id/invoice/reuse - link an existing invoice by invoice number
router.post('/:id/invoice/reuse', async (req, res, next) => {
  try {
    const assetId = parseInt(req.params.id, 10);
    const invoiceNumber = (req.body?.invoiceNumber ?? req.body?.invoice_number ?? '').toString().trim();

    if (!Number.isInteger(assetId) || assetId < 1) {
      return res.status(400).json({ data: null, error: 'Invalid asset ID' });
    }
    if (!invoiceNumber) {
      return res.status(400).json({ data: null, error: 'Invoice number is required' });
    }

    const db = getDbOrFail();
    const previousInvoiceLink = await getAssetInvoiceLink(db, assetId);
    const assetCheck = db.prepare('SELECT Id FROM Assets WHERE Id = ?');
    assetCheck.bind([assetId]);
    const assetExists = await assetCheck.step();
    assetCheck.free();
    if (!assetExists) {
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }

    const invoice = await getInvoiceByNumber(db, invoiceNumber);
    if (!invoice?.Id || !invoice.StoredPath) {
      return res.status(404).json({ data: null, error: 'No uploaded invoice found for that invoice number' });
    }

    const update = db.prepare('UPDATE Assets SET InvoiceId = ?, InvoicePath = ?, InvoiceNumber = ? WHERE Id = ?');
    await update.run([invoice.Id, invoice.StoredPath, invoice.InvoiceNumber, assetId]);
    update.free();

    await cleanupOrphanInvoice(db, previousInvoiceLink);
    persist();
    const row = await getAssetById(db, assetId);
    res.status(200).json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:id - single asset
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid asset ID' });
    }
    const db = getDbOrFail();
    const row = await getAssetById(db, id);
    if (!row) {
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }
    res.json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/assets - create asset (JSON or multipart with optional invoice PDF)
router.post('/', (req, res, next) => {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    return createWithOptionalInvoice(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  }
  next();
}, async (req, res, next) => {
  try {
    const { name, type, serialNumber, status, vendor, purchaseDate, warrantyExpiry } = pickAssetFields(
      req.body || {}
    );
    if (!name || !type || !serialNumber || !vendor || !purchaseDate) {
      return res.status(400).json({
        data: null,
        error: 'Name, type, serialNumber, vendor, and purchaseDate are required',
      });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ data: null, error: `Invalid type. Allowed: ${VALID_TYPES.join(', ')}` });
    }
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ data: null, error: `Invalid status. Allowed: ${VALID_STATUS.join(', ')}` });
    }
    const db = getDbOrFail();
    try {
      const stmt = db.prepare(
        'INSERT INTO Assets (Name, Type, SerialNumber, Status, Vendor, PurchaseDate, WarrantyExpiry) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      await stmt.run([name, type, serialNumber, status, vendor, purchaseDate, warrantyExpiry]);
      stmt.free();
    } catch (err) {
      if (isUniqueConstraintError(err) && (err.message || '').includes('SerialNumber')) {
        return res.status(409).json({ data: null, error: 'An asset with this serial number already exists' });
      }
      throw err;
    }
    const idResult = await db.exec('SELECT last_insert_rowid() as id');
    const id = idResult[0].values[0][0];
    if (req.file && req.file.buffer) {
      const invoiceNumber = (req.body?.invoiceNumber ?? req.body?.invoice_number ?? '').toString().trim() || null;
      const { invoiceId, filename } = await createInvoiceRecord(db, id, req.file, invoiceNumber);
      const upd = db.prepare('UPDATE Assets SET InvoiceId = ?, InvoicePath = ?, InvoiceNumber = ? WHERE Id = ?');
      await upd.run([invoiceId, filename, invoiceNumber, id]);
      upd.free();
    }
    const row = await getAssetById(db, id);
    persist();
    res.status(201).json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// PUT /api/assets/:id - update asset
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid asset ID' });
    }
    const { name, type, serialNumber, status, vendor, purchaseDate, warrantyExpiry } = pickAssetFields(
      req.body || {}
    );
    if (!name || !type || !serialNumber || !vendor || !purchaseDate) {
      return res.status(400).json({
        data: null,
        error: 'Name, type, serialNumber, vendor, and purchaseDate are required',
      });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ data: null, error: `Invalid type. Allowed: ${VALID_TYPES.join(', ')}` });
    }
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ data: null, error: `Invalid status. Allowed: ${VALID_STATUS.join(', ')}` });
    }
    const db = getDbOrFail();
    const invoiceLink = await getAssetInvoiceLink(db, id);
    const check = db.prepare('SELECT Id FROM Assets WHERE Id = ?');
    check.bind([id]);
    if (!(await check.step())) {
      check.free();
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }
    check.free();
    try {
      const stmt = db.prepare(
        'UPDATE Assets SET Name = ?, Type = ?, SerialNumber = ?, Status = ?, Vendor = ?, PurchaseDate = ?, WarrantyExpiry = ? WHERE Id = ?'
      );
      await stmt.run([name, type, serialNumber, status, vendor, purchaseDate, warrantyExpiry, id]);
      stmt.free();
    } catch (err) {
      if (isUniqueConstraintError(err) && (err.message || '').includes('SerialNumber')) {
        return res.status(409).json({ data: null, error: 'An asset with this serial number already exists' });
      }
      throw err;
    }
    const row = await getAssetById(db, id);
    persist();
    res.json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/assets/:id - delete asset
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid asset ID' });
    }
    const db = getDbOrFail();
    const check = db.prepare('SELECT Id FROM Assets WHERE Id = ?');
    check.bind([id]);
    if (!(await check.step())) {
      check.free();
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }
    check.free();
    try {
      const stmt = db.prepare('DELETE FROM Assets WHERE Id = ?');
      await stmt.run([id]);
      stmt.free();
    } catch (err) {
      if (isForeignKeyConstraintError(err)) {
        return res.status(409).json({
          data: null,
          error: 'Cannot delete asset: it may have assignments or repairs',
        });
      }
      throw err;
    }
    await cleanupOrphanInvoice(db, invoiceLink);
    persist();
    res.status(200).json({ data: { id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;

