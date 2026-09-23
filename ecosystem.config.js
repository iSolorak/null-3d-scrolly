// pm2 process definition — `pm2 start ecosystem.config.js`
module.exports = {
  apps: [
    {
      name: "nullshell",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1", // nginx is the only thing that should reach it
        PORT: 3099
      },
      out_file: "./logs/out.log",
      error_file: "./logs/err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    }
  ]
};
