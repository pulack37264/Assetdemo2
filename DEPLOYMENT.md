# Production Deployment Guide — IT Asset Management

This guide covers deploying the app to a server and making it available from other networks (intranet or internet) with industry-standard practices.

---

## Architecture Overview

- **Client**: React + Vite (built to static files in `client/dist`)
- **Server**: Node.js Express API (MSSQL, JWT auth, optional SMTP)
- **Production mode**: One process serves both the API and the built client on a single port (optional: use Nginx in front for SSL/load balancing)

---

## 1. Server Requirements

- **OS**: Windows Server or Linux (e.g. Ubuntu 22.04)
- **Node.js**: 18+ (LTS recommended)
- **Database**: Microsoft SQL Server (on same machine or reachable over network)
- **Port**: One port (e.g. 3001 or 80/443 behind reverse proxy)

---

## 2. Build for Production

On your build machine or CI:

```bash
# Install dependencies
cd client && npm ci && cd ..
cd server && npm ci && cd ..

# Build frontend (output: client/dist)
cd client
npm run build
cd ..

# Frontend must know the API base URL at build time.
# Set VITE_API_URL to the URL users will use to reach the API (same origin if single-server).
# Examples:
#   Same origin (recommended when server serves both): use relative /api
#   Different origin: full URL e.g. https://api.yourcompany.com
# Windows CMD:
set VITE_API_URL=/api
# PowerShell:
$env:VITE_API_URL="/api"
# Linux/macOS:
export VITE_API_URL=/api

cd client && npm run build && cd ..
```

**Important**: If you serve the app and API from the same host/port (recommended), set `VITE_API_URL=/api` so the client calls the same origin (no CORS issues).

---

## 3. Environment Variables (Production)

Create `server/.env` on the server (never commit real secrets). Required and optional:

```env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Required in production: use a long random secret
JWT_SECRET=your-very-long-random-secret-at-least-32-chars

# Optional: restrict CORS to your frontend origin (if different from API)
# CORS_ORIGIN=https://yourdomain.com

# Admin seed (optional, only if Admins table is empty)
# ADMIN_USERNAME=admin
# ADMIN_PASSWORD=your-secure-password

# Microsoft SQL Server (must be reachable from the server)
DB_SERVER=your-sql-server-hostname-or-ip
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=AssetManagement
DB_ENCRYPT=true

# Optional: email (assignment notifications)
# SMTP_HOST=smtp.office365.com
# SMTP_PORT=587
# SMTP_USER=notifications@yourcompany.com
# SMTP_PASS=your-app-password
# MAIL_FROM=IT Assets <notifications@yourcompany.com>
```

- **HOST=0.0.0.0**: Binds the app to all interfaces so it’s reachable from other machines.
- **JWT_SECRET**: Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- **DB_SERVER**: Use hostname or IP of the SQL Server. Ensure firewall allows the server to connect (default port 1433).

---

## 4. Deploy Files to the Server

Copy the whole project (or only what’s needed):

- `server/` (including `node_modules` if you run `npm ci` on server, or copy after `npm ci`)
- `client/dist/` (built output)

Example layout on server:

```
/var/www/asset-demo/   (Linux) or C:\apps\asset-demo\  (Windows)
  server/
    .env
    node_modules/
    src/
    package.json
  client/
    dist/
      index.html
      assets/
```

---

## 5. Run the Application

### Option A: Direct Node (single port, good for internal/quick deploy)

```bash
cd server
node src/index.js
```

The server will serve:

- `GET /api/*` → API
- Everything else → `client/dist` (SPA)

Ensure `NODE_ENV=production` and `client/dist` exists so the app is served.

### Option B: PM2 (recommended for production)

Keeps the process running, restarts on crash, and can start on boot.

```bash
npm install -g pm2
mkdir -p server/logs   # or: mkdir server\logs  on Windows
cd server
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # enable start on boot (follow the command it prints)
```

Use the included `server/ecosystem.config.cjs`. To view logs: `pm2 logs`, to restart: `pm2 restart asset-api`.

### Option C: Nginx reverse proxy (SSL, same or different server)

Run the Node app on a high port (e.g. 3001) and put Nginx in front:

```nginx
# /etc/nginx/sites-available/asset-demo
server {
    listen 80;
    server_name your-server-ip-or-domain.com;
    # Redirect HTTP to HTTPS (after you have SSL)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then:

```bash
sudo ln -s /etc/nginx/sites-available/asset-demo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

For HTTPS (recommended for internet access), use Let’s Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Set `CORS_ORIGIN=https://yourdomain.com` if the browser hits that origin.

---

## 6. Firewall and Network Access

- **Server firewall**: Allow the port the app listens on (e.g. 3001) from:
  - Other networks (e.g. 0.0.0.0/0 for internet, or your office IP range for intranet).
- **SQL Server**: Allow the app server’s IP to connect to SQL (port 1433 or your instance port).
- **Client networks**: Users must be able to reach the server’s IP (or domain) and port (or 80/443 if using Nginx).

**Windows Firewall** (if app runs on Windows):

```powershell
New-NetFirewallRule -DisplayName "Asset App" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

**Linux (ufw)**:

```bash
sudo ufw allow 3001/tcp
sudo ufw reload
```

---

## 7. Access from Another Network

- **By IP**: `http://<server-ip>:3001` (or `http://<server-ip>` if Nginx listens on 80).
- **By hostname**: Configure DNS or hosts so a hostname points to the server, then use `http://hostname:3001` or `https://hostname` with Nginx + SSL.
- **Same origin**: With `VITE_API_URL=/api`, the UI and API are on the same origin; no extra CORS setup needed when using one server.

---

## 8. Checklist (Production)

- [ ] `NODE_ENV=production`
- [ ] Strong `JWT_SECRET` (no default)
- [ ] `server/.env` with correct DB and optional SMTP
- [ ] `VITE_API_URL=/api` (or your API URL) when building the client
- [ ] `client/dist` present and served by the server (or by Nginx)
- [ ] Server bound to `0.0.0.0` (or use `HOST=0.0.0.0`)
- [ ] Firewall allows app port (and SQL if remote)
- [ ] Process manager (e.g. PM2) and optional start on boot
- [ ] HTTPS and `CORS_ORIGIN` if exposed to the internet

---

## 9. Optional: Docker

A `Dockerfile` can be added to build the client and run the server in one image. For now, the steps above are sufficient for a single-server, production-ready deployment. If you need a sample Dockerfile, it can be added in a follow-up.
