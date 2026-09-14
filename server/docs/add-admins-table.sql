-- Create Admins table for admin login (fix: Invalid object name 'Admins')
-- Run on your database (e.g. AssetManagement) in SSMS or sqlcmd.

IF OBJECT_ID(N'dbo.Admins', N'U') IS NULL
CREATE TABLE dbo.Admins (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  Username NVARCHAR(255) NOT NULL UNIQUE,
  PasswordHash NVARCHAR(255) NOT NULL,
  CreatedAt NVARCHAR(50) NOT NULL DEFAULT CONVERT(NVARCHAR(50), GETDATE(), 126)
);
