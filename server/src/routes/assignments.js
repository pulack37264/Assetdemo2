import { Router } from 'express';
import { getDb, persist } from '../config/db.js';
import { sendAssignmentNotification, sendUnassignmentNotification } from '../services/email.js';

const router = Router();

function getDbOrFail() {
  try {
    return getDb();
  } catch {
    throw new Error('Database not initialized');
  }
}

// POST /api/assignments - assign asset to employee
router.post('/', async (req, res, next) => {
  try {
    const assetId = Number(req.body?.assetId ?? req.body?.AssetId);
    const employeeId = Number(req.body?.employeeId ?? req.body?.EmployeeId);
    if (!assetId || !employeeId) {
      return res.status(400).json({ data: null, error: 'assetId and employeeId are required' });
    }

    const db = getDbOrFail();

    // Check employee exists (need Email for notification)
    let stmt = db.prepare('SELECT Id, Name, Email FROM Employees WHERE Id = ?');
    stmt.bind([employeeId]);
    const employee = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();
    if (!employee) {
      return res.status(404).json({ data: null, error: 'Employee not found' });
    }

    // Check asset exists and is Available (need SerialNumber for notification)
    stmt = db.prepare(
      'SELECT Id, Name, SerialNumber, Status FROM Assets WHERE Id = ?'
    );
    stmt.bind([assetId]);
    const asset = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();
    if (!asset) {
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }
    if (asset.Status !== 'Available') {
      return res
        .status(409)
        .json({ data: null, error: `Asset is not available (current status: ${asset.Status})` });
    }

    // Create assignment and update asset
    const now = new Date().toISOString();
    stmt = db.prepare(
      'INSERT INTO Assignments (EmployeeId, AssetId, AssignedDate, Status) VALUES (?, ?, ?, ?)'
    );
    await stmt.run([employeeId, assetId, now, 'Active']);
    stmt.free();

    stmt = db.prepare('UPDATE Assets SET Status = ?, AssignedToId = ? WHERE Id = ?');
    await stmt.run(['Assigned', employeeId, assetId]);
    stmt.free();

    persist();

    // Notify employee by email (non-blocking; assignment already succeeded)
    sendAssignmentNotification(employee, asset, now).catch((err) => {
      console.error('[assignments] Email notification error:', err.message);
    });

    return res.status(201).json({
      data: {
        AssetId: assetId,
        EmployeeId: employeeId,
        AssignedDate: now,
        Status: 'Active',
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/assignments/return/:assetId - return asset
router.post('/return/:assetId', async (req, res, next) => {
  try {
    const assetId = Number(req.params.assetId);
    if (!assetId) {
      return res.status(400).json({ data: null, error: 'Invalid asset ID' });
    }
    const db = getDbOrFail();

    // Check asset exists
    let stmt = db.prepare('SELECT Id, Status FROM Assets WHERE Id = ?');
    stmt.bind([assetId]);
    const asset = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();
    if (!asset) {
      return res.status(404).json({ data: null, error: 'Asset not found' });
    }

    // Find active assignment
    stmt = db.prepare(
      'SELECT Id FROM Assignments WHERE AssetId = ? AND ReturnedDate IS NULL AND Status = ? ORDER BY AssignedDate DESC LIMIT 1'
    );
    stmt.bind([assetId, 'Active']);
    const assignment = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();
    if (!assignment) {
      return res.status(409).json({ data: null, error: 'No active assignment for this asset' });
    }

    const now = new Date().toISOString();

    // Close assignment
    stmt = db.prepare('UPDATE Assignments SET ReturnedDate = ?, Status = ? WHERE Id = ?');
    await stmt.run([now, 'Returned', assignment.Id]);
    stmt.free();

    // Fetch employee and asset info for notification before clearing AssignedToId
    stmt = db.prepare(`
      SELECT e.Id AS EmployeeId, e.Name AS EmployeeName, e.Email, a.Name AS AssetName, a.SerialNumber
      FROM Assignments ASn
      JOIN Employees e ON e.Id = ASn.EmployeeId
      JOIN Assets a ON a.Id = ASn.AssetId
      WHERE ASn.Id = ?
    `);
    stmt.bind([assignment.Id]);
    const notificationData = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();

    // Update asset back to Available
    stmt = db.prepare('UPDATE Assets SET Status = ?, AssignedToId = NULL WHERE Id = ?');
    await stmt.run(['Available', assetId]);
    stmt.free();

    persist();

    if (notificationData) {
      sendUnassignmentNotification(
        { Name: notificationData.EmployeeName, Email: notificationData.Email },
        { Name: notificationData.AssetName, SerialNumber: notificationData.SerialNumber },
        now
      ).catch((err) => {
        console.error('[assignments] Unassignment email notification error:', err.message);
      });
    }

    return res.status(200).json({
      data: {
        AssetId: assetId,
        ReturnedDate: now,
        Status: 'Returned',
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/assignments - get all assignments (tracking history)
router.get('/', async (req, res, next) => {
  try {
    const db = getDbOrFail();

    const stmt = db.prepare(`
      SELECT 
        a.Id,
        a.EmployeeId,
        a.AssetId,
        a.AssignedDate,
        a.ReturnedDate,
        a.Status,
        e.Name AS EmployeeName,
        e.Department,
        e.Branch,
        ast.Name AS AssetName,
        ast.SerialNumber,
        ast.Type AS AssetType
      FROM Assignments a
      JOIN Employees e ON e.Id = a.EmployeeId
      JOIN Assets ast ON ast.Id = a.AssetId
      ORDER BY a.AssignedDate DESC
    `);
    
    const assignments = [];
    while (await stmt.step()) {
      assignments.push(stmt.getAsObject());
    }
    stmt.free();

    return res.json({
      data: assignments,
      error: null,
    });
  } catch (err) {
    console.error('[assignments] Error fetching all assignments:', err.message);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// GET /api/assignments/asset/:assetId - get all assignments (history) for a specific asset
router.get('/asset/:assetId', async (req, res, next) => {
  try {
    const assetId = Number(req.params.assetId);
    console.log(`[assignments] GET /asset/${assetId} - START`);
    
    if (!assetId) {
      console.log('[assignments] Invalid asset ID');
      return res.status(400).json({ data: null, error: 'Invalid asset ID' });
    }
    
    const db = getDbOrFail();

    // First: check if this asset exists
    const assetCheckStmt = db.prepare('SELECT Id, Name FROM Assets WHERE Id = ?');
    assetCheckStmt.bind([assetId]);
    const assetExists = await assetCheckStmt.get();
    assetCheckStmt.free();
    console.log(`[assignments] Asset exists: ${assetExists ? 'YES - ' + assetExists.Name : 'NO'}`);

    // Get all assignments for this asset (active and returned), most recent first
    const stmt = db.prepare(`
      SELECT 
        a.Id,
        a.EmployeeId,
        a.AssetId,
        a.AssignedDate,
        a.ReturnedDate,
        a.Status,
        e.Name AS EmployeeName,
        e.Email,
        e.Department,
        e.Branch
      FROM Assignments a
      JOIN Employees e ON e.Id = a.EmployeeId
      WHERE a.AssetId = ?
      ORDER BY a.AssignedDate DESC
    `);
    stmt.bind([assetId]);
    console.log(`[assignments] Query prepared, assetId param: ${assetId}`);
    
    const assignments = [];
    let stepCount = 0;
    while (await stmt.step()) {
      stepCount++;
      const row = stmt.getAsObject();
      console.log(`[assignments] Row ${stepCount}:`, row);
      assignments.push(row);
    }
    stmt.free();

    console.log(`[assignments] Asset ${assetId} history: ${assignments.length} total records`);

    return res.json({
      data: assignments,
      error: null,
    });
  } catch (err) {
    console.error('[assignments] Error fetching asset history:', err.message, err.stack);
    return res.status(500).json({ data: null, error: err.message });
  }
});

export default router;

