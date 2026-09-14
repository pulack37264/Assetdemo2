# How to run

**Prerequisite:** The app uses **Microsoft SQL Server**. You need:
1. SQL Server installed and running (e.g. on `localhost`).
2. A database named `AssetManagement` (or the name in `server/.env`).
3. Schema applied: run `server/docs/sql-server-schema.sql` on that database (in SSMS or sqlcmd).

Set your SQL Server password in **server/.env** (`DB_PASSWORD=...`). Also set `DB_SERVER`, `DB_USER`, `DB_NAME` if different from the defaults.

---

**First time:** install dependencies once.

```powershell
cd server
npm install
cd ..\client
npm install
```

**Every time:** start backend, then frontend.

**Terminal 1 – backend**
```powershell
cd server
npm start
```
Wait until you see: `Database ready (Microsoft SQL Server).` and `IT Asset Management API running at http://localhost:3001`

**Terminal 2 – frontend**
```powershell
cd client
npm start
```
Then open **http://localhost:5173** in your browser.

