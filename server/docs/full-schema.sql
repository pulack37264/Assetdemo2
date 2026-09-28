-- =============================================================================
-- IT Asset Management - Full SQL Server Schema
-- =============================================================================
-- Run this script to create or update the entire database schema.
-- Works for: new database (creates all tables) or existing (adds missing objects).
--
-- Usage:
--   SSMS: Open file, select database (e.g. AssetManagement), Execute (F5).
--   sqlcmd: sqlcmd -S localhost -d AssetManagement -i "server/docs/full-schema.sql" -U sa -P YourPassword
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Employees
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Employees', N'U') IS NULL
CREATE TABLE dbo.Employees (
  Id INT NOT NULL PRIMARY KEY,
  Name NVARCHAR(255) NOT NULL,
  Email NVARCHAR(255) NOT NULL UNIQUE,
  Department NVARCHAR(255) NOT NULL,
  Branch NVARCHAR(255) NOT NULL DEFAULT N'',
  JoinDate NVARCHAR(50) NULL,
  CreatedAt NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126)
);

-- -----------------------------------------------------------------------------
-- 2. Assets
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Assets', N'U') IS NULL
CREATE TABLE dbo.Assets (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  Name NVARCHAR(255) NOT NULL,
  Type NVARCHAR(100) NOT NULL,
  SerialNumber NVARCHAR(255) NOT NULL UNIQUE,
  Status NVARCHAR(50) NOT NULL DEFAULT N'Available' CHECK (Status IN (N'Available', N'Assigned', N'In Repair', N'Retired')),
  Vendor NVARCHAR(255) NOT NULL,
  PurchaseDate NVARCHAR(50) NOT NULL,
  WarrantyExpiry NVARCHAR(50) NULL,
  InvoicePath NVARCHAR(500) NULL,
  InvoiceNumber NVARCHAR(255) NULL,
  InvoiceId INT NULL,
  AssignedToId INT NULL REFERENCES dbo.Employees(Id),
  AddedAt NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126)
);

-- -----------------------------------------------------------------------------
-- 3. Assignments
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Assignments', N'U') IS NULL
CREATE TABLE dbo.Assignments (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  EmployeeId INT NOT NULL REFERENCES dbo.Employees(Id),
  AssetId INT NOT NULL REFERENCES dbo.Assets(Id),
  AssignedDate NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126),
  ReturnedDate NVARCHAR(50) NULL,
  Status NVARCHAR(50) NOT NULL DEFAULT N'Active'
);

-- -----------------------------------------------------------------------------
-- 4. Repairs
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Repairs', N'U') IS NULL
CREATE TABLE dbo.Repairs (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  AssetId INT NOT NULL REFERENCES dbo.Assets(Id),
  IssueDescription NVARCHAR(MAX) NOT NULL,
  RepairVendor NVARCHAR(255) NULL,
  Cost FLOAT NULL,
  Status NVARCHAR(50) NOT NULL DEFAULT N'Pending' CHECK (Status IN (N'Pending', N'In Progress', N'Completed')),
  StartDate NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126),
  CompletedDate NVARCHAR(50) NULL
);

-- -----------------------------------------------------------------------------
-- 5. Invoices
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Invoices', N'U') IS NULL
CREATE TABLE dbo.Invoices (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  AssetId INT NOT NULL REFERENCES dbo.Assets(Id),
  InvoiceNumber NVARCHAR(255) NULL,
  OriginalFileName NVARCHAR(500) NOT NULL,
  StoredPath NVARCHAR(500) NOT NULL,
  UploadedAt NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126)
);

-- -----------------------------------------------------------------------------
-- 6. Assets.InvoiceId FK (for shared invoices)
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Invoices', N'U') IS NOT NULL
   AND COL_LENGTH('dbo.Assets', 'InvoiceId') IS NULL
BEGIN
  ALTER TABLE dbo.Assets ADD InvoiceId INT NULL;
END;

IF OBJECT_ID(N'dbo.Invoices', N'U') IS NOT NULL
   AND COL_LENGTH('dbo.Assets', 'InvoiceId') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.foreign_keys
     WHERE name = N'FK_Assets_InvoiceId_Invoices'
   )
BEGIN
  ALTER TABLE dbo.Assets
  ADD CONSTRAINT FK_Assets_InvoiceId_Invoices
  FOREIGN KEY (InvoiceId) REFERENCES dbo.Invoices(Id);
END;

-- -----------------------------------------------------------------------------
-- 7. Software Licenses
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.SoftwareLicenses', N'U') IS NULL
CREATE TABLE dbo.SoftwareLicenses (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  Name NVARCHAR(255) NOT NULL,
  Vendor NVARCHAR(255) NOT NULL,
  PurchaseDate NVARCHAR(50) NOT NULL,
  ExpiryDate NVARCHAR(50) NOT NULL,
  Cost FLOAT NOT NULL,
  CreatedAt NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126)
);

-- -----------------------------------------------------------------------------
-- 8. Gate Passes
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.GatePasses', N'U') IS NULL
CREATE TABLE dbo.GatePasses (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  ReferenceNumber NVARCHAR(255) NOT NULL,
  PassNumber NVARCHAR(255) NOT NULL,
  GatePassFrom NVARCHAR(255) NOT NULL DEFAULT N'',
  GatePassTo NVARCHAR(255) NOT NULL DEFAULT N'',
  ProductName NVARCHAR(255) NOT NULL,
  PersonName NVARCHAR(255) NOT NULL,
  SerialNumber NVARCHAR(255) NOT NULL,
  Notes NVARCHAR(MAX) NULL,
  ReceivedBy NVARCHAR(255) NOT NULL,
  IssuedBy NVARCHAR(255) NOT NULL,
  PassDate NVARCHAR(50) NOT NULL,
  CreatedAt NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126)
);

-- Add From/To columns if GatePasses exists but columns are missing
IF OBJECT_ID(N'dbo.GatePasses', N'U') IS NOT NULL AND COL_LENGTH('dbo.GatePasses', 'GatePassFrom') IS NULL
  ALTER TABLE dbo.GatePasses ADD GatePassFrom NVARCHAR(255) NOT NULL DEFAULT N'';
IF OBJECT_ID(N'dbo.GatePasses', N'U') IS NOT NULL AND COL_LENGTH('dbo.GatePasses', 'GatePassTo') IS NULL
  ALTER TABLE dbo.GatePasses ADD GatePassTo NVARCHAR(255) NOT NULL DEFAULT N'';

-- -----------------------------------------------------------------------------
-- 9. Admins (admin login)
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Admins', N'U') IS NULL
CREATE TABLE dbo.Admins (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  Username NVARCHAR(255) NOT NULL UNIQUE,
  PasswordHash NVARCHAR(255) NOT NULL,
  CreatedAt NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126)
);

-- =============================================================================
-- End of full schema
-- =============================================================================
