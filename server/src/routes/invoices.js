import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb } from '../config/db.js';

const router = Router();
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

function getDbOrFail() {
  try {
    return getDb();
  } catch {
    throw new Error('Database not initialized');
  }
}

// GET /api/invoices - List all invoices with asset info (for table + PDF link)
router.get('/', async (_req, res, next) => {
  try {
    const db = getDbOrFail();
    const sql = `
      SELECT i.Id, i.AssetId, i.InvoiceNumber, i.OriginalFileName, i.StoredPath, i.UploadedAt,
             COUNT(linked.Id) AS LinkedAssetCount,
             a.Name AS AssetName, a.SerialNumber, a.Type AS AssetType
      FROM Invoices i
      JOIN Assets a ON a.Id = i.AssetId
      LEFT JOIN Assets linked ON linked.InvoiceId = i.Id
      GROUP BY i.Id, i.AssetId, i.InvoiceNumber, i.OriginalFileName, i.StoredPath, i.UploadedAt,
               a.Name, a.SerialNumber, a.Type
      ORDER BY i.UploadedAt DESC
    `;
    const stmt = db.prepare(sql);
    const rows = [];
    while (await stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    res.json({ data: rows, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/invoices - upload one PDF and create a reusable invoice record
router.post('/', uploadInvoice.single('invoice'), async (req, res, next) => {
  try {
    const assetId = parseInt((req.body?.assetId ?? '').toString(), 10);
    const invoiceNumber = (req.body?.invoiceNumber ?? req.body?.invoice_number ?? '').toString().trim() || null;

    if (!Number.isInteger(assetId) || assetId < 1) {
      return res.status(400).json({ data: null, error: 'A valid assetId is required to create an invoice' });
    }
    if (!req.file) {
      return res.status(400).json({ data: null, error: 'No PDF file uploaded. Send a file with field name "invoice".' });
    }

    const db = getDbOrFail();
    const assetStmt = db.prepare('SELECT Id FROM Assets WHERE Id = ?');
    assetStmt.bind([assetId]);
    const assetExists = await assetStmt.step();
    assetStmt.free();
    if (!assetExists) {
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }

    ensureInvoicesDir();
    const originalName = (req.file.originalname || 'invoice.pdf').toString();
    const insert = db.prepare(
      'INSERT INTO Invoices (AssetId, InvoiceNumber, OriginalFileName, StoredPath, UploadedAt) VALUES (?, ?, ?, ?, datetime(\'now\'))'
    );
    await insert.run([assetId, invoiceNumber, originalName, '']);
    insert.free();

    const idResult = await db.exec('SELECT last_insert_rowid() as id');
    const invoiceId = idResult[0].values[0][0];
    const filename = `invoice-${invoiceId}.pdf`;
    fs.writeFileSync(path.join(INVOICES_DIR, filename), req.file.buffer);

    const update = db.prepare('UPDATE Invoices SET StoredPath = ? WHERE Id = ?');
    await update.run([filename, invoiceId]);
    update.free();

    const stmt = db.prepare(`
      SELECT i.Id, i.AssetId, i.InvoiceNumber, i.OriginalFileName, i.StoredPath, i.UploadedAt,
             a.Name AS AssetName, a.SerialNumber, a.Type AS AssetType
      FROM Invoices i
      JOIN Assets a ON a.Id = i.AssetId
      WHERE i.Id = ?
    `);
    stmt.bind([invoiceId]);
    const row = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();

    res.status(201).json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/invoices/:id/file - view invoice PDF by invoice id
router.get('/:id/file', async (req, res, next) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) {
      return res.status(400).json({ data: null, error: 'Invalid invoice ID' });
    }

    const db = getDbOrFail();
    const stmt = db.prepare('SELECT StoredPath FROM Invoices WHERE Id = ?');
    stmt.bind([invoiceId]);
    const row = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();

    if (!row?.StoredPath) {
      return res.status(404).json({ data: null, error: 'Invoice file not found' });
    }

    const filePath = path.join(INVOICES_DIR, row.StoredPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ data: null, error: 'Invoice file not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(path.resolve(filePath));
  } catch (err) {
    next(err);
  }
});

export default router;
