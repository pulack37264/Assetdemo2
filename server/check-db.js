/**
 * Run database queries to inspect data.
 * Usage: node check-db.js
 * (Make sure the database file exists: server/data/AssetManagement)
 */
import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'AssetManagement.sqlite');

if (!fs.existsSync(dbPath)) {
  console.error('Database not found at:', dbPath);
  console.error('Start the API once (npm start) to create it.');
  process.exit(1);
}

const SQL = await initSqlJs({
  locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
});
const buffer = fs.readFileSync(dbPath);
const db = new SQL.Database(new Uint8Array(buffer));

function runQuery(name, sql) {
  console.log('\n---', name, '---');
  try {
    const stmt = db.prepare(sql);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    if (rows.length === 0) {
      console.log('(no rows)');
    } else {
      console.table(rows);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

runQuery('Employees', 'SELECT * FROM Employees ORDER BY Id');
runQuery('Assets', 'SELECT Id, Name, Type, SerialNumber, Status, Vendor, PurchaseDate, WarrantyExpiry, AssignedToId FROM Assets ORDER BY Id');
runQuery('Assignments', 'SELECT * FROM Assignments ORDER BY Id');
runQuery('Repairs', 'SELECT Id, AssetId, IssueDescription, RepairVendor, Cost, Status, StartDate, CompletedDate FROM Repairs ORDER BY Id');

db.close();
console.log('\nDone.\n');
