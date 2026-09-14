/**
 * PM2 ecosystem file for production.
 * Usage: from project root, run:  pm2 start server/ecosystem.config.cjs
 * Or from server/:  pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'asset-api',
      cwd: __dirname,
      script: 'src/index.js',
      node_args: '--enable-source-maps',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
