import { Router } from 'express';
import { getDb, persist, isUniqueConstraintError, isForeignKeyConstraintError } from '../config/db.js';

const router = Router();

function getDbOrFail() {
  try {
    return getDb();
  } catch {
    throw new Error('Database not initialized');
  }
}

// GET /api/employees - List all employees (with current assign date if assigned to an asset)
router.get('/', async (req, res, next) => {
  try {
    const db = getDbOrFail();
    const stmt = db.prepare(`
      SELECT e.Id, e.Name, e.Email, e.Department, e.Branch, e.JoinDate, e.CreatedAt,
             (SELECT MAX(a.AssignedDate) FROM Assignments a WHERE a.EmployeeId = e.Id AND a.ReturnedDate IS NULL AND a.Status = 'Active') AS AssignedDate
      FROM Employees e ORDER BY e.Name
    `);
    const rows = [];
    while (await stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    res.json({ data: rows, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/employees/:id - Get single employee (with current assign date if assigned)
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid employee ID' });
    }
    const db = getDbOrFail();
    const stmt = db.prepare(`
      SELECT e.Id, e.Name, e.Email, e.Department, e.Branch, e.JoinDate, e.CreatedAt,
             (SELECT MAX(a.AssignedDate) FROM Assignments a WHERE a.EmployeeId = e.Id AND a.ReturnedDate IS NULL AND a.Status = 'Active') AS AssignedDate
      FROM Employees e WHERE e.Id = ?
    `);
    stmt.bind([id]);
    const row = (await stmt.step()) ? stmt.getAsObject() : null;
    stmt.free();
    if (!row) {
      return res.status(404).json({ data: null, error: 'Employee not found' });
    }
    res.json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

function pickEmployeeFields(body) {
  const name = (body?.name ?? body?.Name ?? '').toString().trim();
  const email = (body?.email ?? body?.Email ?? '').toString().trim();
  const department = (body?.department ?? body?.Department ?? '').toString().trim();
  const branch = (body?.branch ?? body?.Branch ?? '').toString().trim();
  const joinDate = (body?.joinDate ?? body?.JoinDate ?? '').toString().trim() || null;
  return { name, email, department, branch, joinDate };
}

// POST /api/employees - Create employee (Employee ID required, used as primary key)
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const rawId = body.id ?? body.Id ?? body.employeeId ?? body.EmployeeId;
    const id = rawId !== undefined && rawId !== null && rawId !== '' ? parseInt(String(rawId), 10) : NaN;
    if (isNaN(id) || id < 1 || !Number.isInteger(id)) {
      return res.status(400).json({
        data: null,
        error: 'Employee ID is required and must be a positive integer',
      });
    }
    const picked = pickEmployeeFields(body);
    const name = String(picked.name ?? '').trim();
    const email = String(picked.email ?? '').trim();
    const department = String(picked.department ?? '').trim();
    const branch = String(picked.branch ?? '').trim();
    const joinDate = picked.joinDate ?? null;
    if (!name || !email || !department) {
      return res.status(400).json({
        data: null,
        error: 'Name, email, and department are required',
      });
    }
    const db = getDbOrFail();
    const exists = db.prepare('SELECT Id FROM Employees WHERE Id = ?');
    exists.bind([id]);
    if (await exists.step()) {
      exists.free();
      return res.status(409).json({ data: null, error: 'An employee with this ID already exists' });
    }
    exists.free();
    try {
      const stmt = db.prepare('INSERT INTO Employees (Id, Name, Email, Department, Branch, JoinDate) VALUES (?, ?, ?, ?, ?, ?)');
      await stmt.run([id, name, email, department, branch, joinDate]);
      stmt.free();
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return res.status(409).json({ data: null, error: 'An employee with this ID or email already exists' });
      }
      throw err;
    }
    const sel = db.prepare(`
      SELECT e.Id, e.Name, e.Email, e.Department, e.Branch, e.JoinDate, e.CreatedAt,
             (SELECT MAX(a.AssignedDate) FROM Assignments a WHERE a.EmployeeId = e.Id AND a.ReturnedDate IS NULL AND a.Status = 'Active') AS AssignedDate
      FROM Employees e WHERE e.Id = ?
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

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid employee ID' });
    }
    const { name, email, department, branch, joinDate } = pickEmployeeFields(req.body || {});
    if (!name || !email || !department) {
      return res.status(400).json({
        data: null,
        error: 'Name, email, and department are required',
      });
    }
    const db = getDbOrFail();
    const check = db.prepare('SELECT Id FROM Employees WHERE Id = ?');
    check.bind([id]);
    if (!(await check.step())) {
      check.free();
      return res.status(404).json({ data: null, error: 'Employee not found' });
    }
    check.free();
    try {
      const stmt = db.prepare('UPDATE Employees SET Name = ?, Email = ?, Department = ?, Branch = ?, JoinDate = ? WHERE Id = ?');
      await stmt.run([name, email, department, branch ?? '', joinDate ?? null, id]);
      stmt.free();
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return res.status(409).json({ data: null, error: 'An employee with this email already exists' });
      }
      throw err;
    }
    const sel = db.prepare(`
      SELECT e.Id, e.Name, e.Email, e.Department, e.Branch, e.JoinDate, e.CreatedAt,
             (SELECT MAX(a.AssignedDate) FROM Assignments a WHERE a.EmployeeId = e.Id AND a.ReturnedDate IS NULL AND a.Status = 'Active') AS AssignedDate
      FROM Employees e WHERE e.Id = ?
    `);
    sel.bind([id]);
    const row = (await sel.step()) ? sel.getAsObject() : null;
    sel.free();
    persist();
    res.json({ data: row, error: null });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/employees/:id - Delete employee
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: 'Invalid employee ID' });
    }
    const db = getDbOrFail();
    const check = db.prepare('SELECT Id FROM Employees WHERE Id = ?');
    check.bind([id]);
    if (!(await check.step())) {
      check.free();
      return res.status(404).json({ data: null, error: 'Employee not found' });
    }
    check.free();
    try {
      const stmt = db.prepare('DELETE FROM Employees WHERE Id = ?');
      await stmt.run([id]);
      stmt.free();
    } catch (err) {
      if (isForeignKeyConstraintError(err)) {
        return res.status(409).json({
          data: null,
          error: 'Cannot delete employee: they may have assigned assets or assignment history',
        });
      }
      throw err;
    }
    persist();
    res.status(200).json({ data: { id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
