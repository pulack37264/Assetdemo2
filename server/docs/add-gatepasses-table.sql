-- Create GatePasses table if missing (fix: Invalid object name 'GatePasses')
-- Run on your database (e.g. AssetManagement) in SSMS or: sqlcmd -S your_server -d AssetManagement -i "server/docs/add-gatepasses-table.sql" -U your_user -P your_password

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

-- Add From/To columns if table exists but columns are missing
IF OBJECT_ID(N'dbo.GatePasses', N'U') IS NOT NULL AND COL_LENGTH('dbo.GatePasses', 'GatePassFrom') IS NULL
  ALTER TABLE dbo.GatePasses ADD GatePassFrom NVARCHAR(255) NOT NULL DEFAULT N'';
IF OBJECT_ID(N'dbo.GatePasses', N'U') IS NOT NULL AND COL_LENGTH('dbo.GatePasses', 'GatePassTo') IS NULL
  ALTER TABLE dbo.GatePasses ADD GatePassTo NVARCHAR(255) NOT NULL DEFAULT N'';
