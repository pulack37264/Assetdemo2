import { AsyncLocalStorage } from 'async_hooks';

let mssqlPool = null;
const asyncLocalStorage = new AsyncLocalStorage();

// --- MSSQL: query translation and adapter ---

function translateSqlForMssql(sql) {
  let out = String(sql)
    .replace(/datetime\s*\(\s*'now'\s*\)/gi, 'GETDATE()');
  out = out.replace(/\s+LIMIT\s+(\d+)\s*$/i, ' OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY');
  return out;
}

function sqlToParameterized(sql) {
  const translated = translateSqlForMssql(sql);
  let i = 0;
  const out = translated.replace(/\?/g, () => `@p${++i}`);
  return { sql: out, paramCount: i };
}

function createMssqlStatement(connection, sql) {
  const { sql: paramSql, paramCount } = sqlToParameterized(sql);
  let params = [];
  let resultRows = null;
  let rowIndex = 0;

  return {
    bind(p) {
      params = Array.isArray(p) ? [...p] : [];
    },
    async executeQuery() {
      const request = connection.request();
      for (let i = 0; i < paramCount; i++) {
        const val = params[i];
        if (val === null || val === undefined) {
          request.input(`p${i + 1}`, null);
        } else if (typeof val === 'number') {
          request.input(`p${i + 1}`, val);
        } else {
          request.input(`p${i + 1}`, String(val));
        }
      }
      const result = await request.query(paramSql);
      resultRows = result.recordset || [];
      rowIndex = 0;
    },
    async run(runParams) {
      const p = runParams !== undefined ? (Array.isArray(runParams) ? runParams : []) : params;
      const request = connection.request();
      for (let i = 0; i < paramCount; i++) {
        const val = p[i];
        if (val === null || val === undefined) {
          request.input(`p${i + 1}`, null);
        } else if (typeof val === 'number') {
          request.input(`p${i + 1}`, val);
        } else {
          request.input(`p${i + 1}`, String(val));
        }
      }
      const isInsert = /^\s*INSERT\s+/i.test(sql.trim());
      const result = await request.query(
        isInsert ? `${paramSql}; SELECT SCOPE_IDENTITY() AS id` : paramSql
      );
      if (isInsert) {
        const idVal = result.recordset && result.recordset[0] && result.recordset[0].id;
        connection.lastInsertId = idVal != null ? Number(idVal) : undefined;
      }
      resultRows = [];
    },
    step() {
      if (resultRows === null) return false;
      return rowIndex < resultRows.length;
    },
    getAsObject() {
      if (resultRows === null || rowIndex >= resultRows.length) return undefined;
      const row = resultRows[rowIndex];
      rowIndex++;
      return row;
    },
    advance() {
      rowIndex++;
    },
    free() {
      resultRows = null;
      params = [];
    },
    getResultRows() {
      return resultRows;
    },
    getRowIndex() {
      return rowIndex;
    },
  };
}

function createMssqlAdapter(connection) {
  connection.lastInsertId = undefined;

  return {
    prepare(sql) {
      const stmt = createMssqlStatement(connection, sql);
      let executed = false;
      return {
        bind(p) {
          stmt.bind(p);
        },
        async step() {
          if (!executed) {
            await stmt.executeQuery();
            executed = true;
          }
          return stmt.step();
        },
        getAsObject() {
          return stmt.getAsObject();
        },
        free() {
          stmt.free();
        },
        async run(p) {
          await stmt.run(p);
        },
        async get() {
          if (!executed) {
            await stmt.executeQuery();
            executed = true;
          }
          const rows = stmt.getResultRows();
          return rows && rows.length > 0 ? rows[0] : undefined;
        },
      };
    },
    async exec(sql) {
      if (/last_insert_rowid|SCOPE_IDENTITY/i.test(sql)) {
        const id = connection.lastInsertId;
        return [{ values: [[id != null ? id : 0]] }];
      }
      throw new Error('Only SELECT last_insert_rowid() is supported in exec() for MSSQL');
    },
  };
}

async function initMssql() {
  if (mssqlPool) return mssqlPool;
  const sql = await import('mssql');
  const config = {
    server: process.env.DB_SERVER || 'localhost',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'AssetManagement',
    connectionTimeout: 30000,
    requestTimeout: 30000,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_ENCRYPT !== 'true',
      enableArithAbort: true,
    },
    pool: { max: 10, min: 0 },
  };
  mssqlPool = await sql.default.connect(config);
  return mssqlPool;
}

async function ensureMssqlSchema(pool) {
  await pool.request().query(`
    DECLARE @constraintName sysname;
    DECLARE @dropSql nvarchar(max);
    DECLARE typeConstraints CURSOR LOCAL FAST_FORWARD FOR
      SELECT name
      FROM sys.check_constraints
      WHERE parent_object_id = OBJECT_ID(N'dbo.Assets')
        AND definition LIKE N'%Type%';

    OPEN typeConstraints;
    FETCH NEXT FROM typeConstraints INTO @constraintName;
    WHILE @@FETCH_STATUS = 0
    BEGIN
      SET @dropSql = N'ALTER TABLE dbo.Assets DROP CONSTRAINT ' + QUOTENAME(@constraintName);
      EXEC sys.sp_executesql @dropSql;
      FETCH NEXT FROM typeConstraints INTO @constraintName;
    END;
    CLOSE typeConstraints;
    DEALLOCATE typeConstraints;
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.Invoices', N'U') IS NOT NULL
       AND COL_LENGTH('dbo.Assets', 'InvoiceId') IS NULL
    BEGIN
      ALTER TABLE dbo.Assets ADD InvoiceId INT NULL;
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.Invoices', N'U') IS NOT NULL
       AND COL_LENGTH('dbo.Assets', 'InvoiceId') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM sys.foreign_keys
         WHERE name = N'FK_Assets_InvoiceId_Invoices'
       )
    BEGIN
      ALTER TABLE dbo.Assets
      ADD CONSTRAINT FK_Assets_InvoiceId_Invoices
      FOREIGN KEY (InvoiceId) REFERENCES dbo.Invoices(Id);
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.Admins', N'U') IS NULL
    CREATE TABLE dbo.Admins (
      Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      Username NVARCHAR(255) NOT NULL UNIQUE,
      PasswordHash NVARCHAR(255) NOT NULL,
      CreatedAt NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126)
    );
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.GatePasses', N'U') IS NOT NULL AND COL_LENGTH('dbo.GatePasses', 'GatePassFrom') IS NULL
    ALTER TABLE dbo.GatePasses ADD GatePassFrom NVARCHAR(255) NOT NULL DEFAULT N'';
  `);
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.GatePasses', N'U') IS NOT NULL AND COL_LENGTH('dbo.GatePasses', 'GatePassTo') IS NULL
    ALTER TABLE dbo.GatePasses ADD GatePassTo NVARCHAR(255) NOT NULL DEFAULT N'';
  `);
}

export async function initDb() {
  const pool = await initMssql();
  await ensureMssqlSchema(pool);
  return null;
}

/** Returns the db handle. Must be called from within request context (dbMiddleware); returns async adapter. */
export function getDb() {
  const connection = asyncLocalStorage.getStore() || mssqlPool;
  if (!connection) throw new Error('Database pool not initialized. Call await initDb() first.');
  return createMssqlAdapter(connection);
}

export function persist() {
  // No-op for SQL Server (transactions commit automatically)
}

/** Request-scoped DB connection. Must be used as Express middleware. */
export function dbMiddleware(req, res, next) {
  if (!mssqlPool) {
    return next(new Error('Database pool not initialized. Call await initDb() first.'));
  }
  asyncLocalStorage.run(mssqlPool, () => {
    next();
  });
}

export async function getPool() {
  await initMssql();
  return mssqlPool;
}

/** Detect UNIQUE constraint violation (SQL Server). Use for 409 Conflict responses. */
export function isUniqueConstraintError(err) {
  if (!err || typeof err.message !== 'string') return false;
  const msg = err.message;
  if (err.number === 2627) return true;
  if (/Violation of UNIQUE KEY|UNIQUE KEY constraint|duplicate key/i.test(msg)) return true;
  return false;
}

/** Detect FOREIGN KEY constraint violation (SQL Server). Use for 409 Conflict responses. */
export function isForeignKeyConstraintError(err) {
  if (!err || typeof err.message !== 'string') return false;
  const msg = err.message;
  if (err.number === 547) return true;
  if (/FOREIGN KEY|REFERENCE constraint|conflicted with the REFERENCE constraint/i.test(msg)) return true;
  return false;
}
