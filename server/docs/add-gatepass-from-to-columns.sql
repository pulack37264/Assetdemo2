-- Add From and To columns to GatePasses (fix: Invalid column name 'GatePassFrom' / 'GatePassTo')
-- Run in SSMS: open this file, select your database (e.g. AssetManagement), then Execute (F5).
-- Or: sqlcmd -S your_server -d AssetManagement -i "server/docs/add-gatepass-from-to-columns.sql" -U your_user -P your_password

IF OBJECT_ID(N'dbo.GatePasses', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.GatePasses', 'GatePassFrom') IS NULL
    ALTER TABLE dbo.GatePasses ADD GatePassFrom NVARCHAR(255) NOT NULL DEFAULT N'';

  IF COL_LENGTH('dbo.GatePasses', 'GatePassTo') IS NULL
    ALTER TABLE dbo.GatePasses ADD GatePassTo NVARCHAR(255) NOT NULL DEFAULT N'';
END
