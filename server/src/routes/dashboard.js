import { Router } from 'express';
import { getDb } from '../config/db.js';

const router = Router();

function getDbOrFail() {
  try {
    return getDb();
  } catch {
    throw new Error('Database not initialized');
  }
}

// GET /api/dashboard/stats - dashboard statistics
router.get('/stats', async (_req, res, next) => {
  try {
    const db = getDbOrFail();

    const totalAssets = (await db.prepare('SELECT COUNT(*) AS n FROM Assets').get())?.n ?? 0;
    const totalEmployees = (await db.prepare('SELECT COUNT(*) AS n FROM Employees').get())?.n ?? 0;
    const activeRepairs = (await db
      .prepare("SELECT COUNT(*) AS n FROM Repairs WHERE Status != 'Completed'")
      .get())?.n ?? 0;

    const statusStmt = db.prepare(
      'SELECT Status, COUNT(*) AS count FROM Assets GROUP BY Status'
    );
    const assetsByStatus = { Available: 0, Assigned: 0, 'In Repair': 0, Retired: 0 };
    while (await statusStmt.step()) {
      const row = statusStmt.getAsObject();
      assetsByStatus[row.Status] = row.count;
    }
    statusStmt.free();

    // Asset warranty expirations: from Assets.WarrantyExpiry (current month + next month for visibility)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const startOfTwoMonths = new Date(now.getFullYear(), now.getMonth() + 2, 1)
      .toISOString()
      .slice(0, 10);
    const assetWarrantyStmt = db.prepare(`
      SELECT Id, Name, Vendor, WarrantyExpiry AS ExpiryDate
      FROM Assets
      WHERE WarrantyExpiry IS NOT NULL AND WarrantyExpiry >= ? AND WarrantyExpiry < ?
      ORDER BY WarrantyExpiry ASC
      LIMIT 20
    `);
    assetWarrantyStmt.bind([startOfMonth, startOfTwoMonths]);
    const upcomingWarranties = [];
    while (await assetWarrantyStmt.step()) upcomingWarranties.push(assetWarrantyStmt.getAsObject());
    assetWarrantyStmt.free();

    const recentStmt = db.prepare(`
      SELECT r.Id, r.AssetId, r.IssueDescription, r.Status, r.StartDate, a.Name AS AssetName, a.SerialNumber AS AssetSerial
      FROM Repairs r
      JOIN Assets a ON a.Id = r.AssetId
      ORDER BY r.StartDate DESC
      LIMIT 5
    `);
    const recentActivity = [];
    while (await recentStmt.step()) recentActivity.push(recentStmt.getAsObject());
    recentStmt.free();

    // Assignment tracking
    const totalAssignments = (await db.prepare('SELECT COUNT(*) AS n FROM Assignments').get())?.n ?? 0;
    const activeAssignments = (await db
      .prepare("SELECT COUNT(*) AS n FROM Assignments WHERE Status = 'Active'")
      .get())?.n ?? 0;
    const returnedAssignments = (await db
      .prepare("SELECT COUNT(*) AS n FROM Assignments WHERE ReturnedDate IS NOT NULL")
      .get())?.n ?? 0;

    const recentAssignmentsStmt = db.prepare(`
      SELECT 
        a.Id, 
        a.EmployeeId, 
        a.AssetId, 
        a.AssignedDate, 
        a.ReturnedDate, 
        a.Status,
        ast.Name AS AssetName,
        ast.SerialNumber,
        e.Name AS EmployeeName
      FROM Assignments a
      JOIN Assets ast ON ast.Id = a.AssetId
      JOIN Employees e ON e.Id = a.EmployeeId
      ORDER BY a.AssignedDate DESC
      LIMIT 10
    `);
    const recentAssignments = [];
    while (await recentAssignmentsStmt.step()) recentAssignments.push(recentAssignmentsStmt.getAsObject());
    recentAssignmentsStmt.free();

    res.json({
      data: {
        totalAssets,
        totalEmployees,
        activeRepairs,
        assetsByStatus,
        upcomingWarranties,
        recentActivity,
        totalAssignments,
        activeAssignments,
        returnedAssignments,
        recentAssignments,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
