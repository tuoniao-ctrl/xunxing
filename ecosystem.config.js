// PM2 进程管理配置 - 同时管理 Node 服务和隧道
module.exports = {
  apps: [
    {
      name: 'wechat-match',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 3000,        // 崩溃后等3秒再重启
      max_restarts: 50,           // 最多重启50次（防止死循环）
      min_uptime: '10s',          // 至少运行10秒才算成功
      listen_timeout: 8000,       // 等待8秒让服务启动
      kill_timeout: 8000,         // 给8秒优雅关闭
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },
    {
      name: 'wechat-tunnel',
      script: 'ssh',
      args: [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'ServerAliveInterval=15',     // 每15秒发心跳
        '-o', 'ServerAliveCountMax=2',       // 2次心跳失败就断开
        '-o', 'ExitOnForwardFailure=yes',
        '-o', 'TCPKeepAlive=yes',
        '-o', 'ConnectTimeout=10',
        '-R', '80:localhost:3000',
        'nokey@localhost.run'
      ],
      interpreter: 'none',
      autorestart: true,
      watch: false,
      max_restarts: 200,
      restart_delay: 10000,       // 断开后等10秒再重连
      error_file: './logs/tunnel-err.log',
      out_file: './logs/tunnel-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
