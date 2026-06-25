const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getTunnelUrl() {
  try {
    const logs = execSync('pm2 logs wechat-tunnel --lines 30 --nostream 2>&1', { encoding: 'utf8', timeout: 5000 });
    const match = logs.match(/([a-z0-9]+\.lhr\.life)/);
    return match ? `https://${match[1]}` : null;
  } catch { return null; }
}

const URL = getTunnelUrl() || 'https://015c526ea2cb5d.lhr.life';
console.log('🔗 当前隧道 URL:', URL);

async function generateQR() {
  try {
    const svg = await QRCode.toString(URL, {
      type: 'svg', width: 300, margin: 2,
      color: { dark: '#d4a574', light: '#1a1a1a' }
    });

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0a0a0a">
  <title>寻星</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #0a0a0a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse at 50% 0%, rgba(212,167,116,0.06) 0%, transparent 60%);
      pointer-events: none;
    }
    .container {
      background: #1a1a1a;
      border-radius: 24px;
      padding: 40px 30px;
      border: 1px solid #2a2a2a;
      text-align: center;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(212,167,116,0.05);
      position: relative;
      z-index: 1;
    }
    .logo { font-size: 48px; margin-bottom: 12px; }
    h1 {
      font-size: 26px;
      font-weight: 800;
      background: linear-gradient(135deg, #d4a574, #e8c97a, #c9a96e);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 8px;
      letter-spacing: 2px;
    }
    .subtitle {
      color: #666;
      font-size: 13px;
      margin-bottom: 28px;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .qr-wrapper {
      background: #1e1e1e;
      border-radius: 16px;
      padding: 16px;
      display: inline-block;
      border: 1px solid #2a2a2a;
      margin-bottom: 24px;
      box-shadow: 0 0 30px rgba(212,167,116,0.08);
    }
    .qr-wrapper svg { display: block; }
    .info {
      font-size: 14px;
      color: #a0a0a0;
      margin-bottom: 16px;
      line-height: 1.8;
      background: rgba(212,167,116,0.06);
      border: 1px solid rgba(212,167,116,0.15);
      border-radius: 12px;
      padding: 12px 16px;
    }
    .info strong { color: #d4a574; }
    .url-box {
      background: #1e1e1e;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 14px 16px;
      word-break: break-all;
      font-size: 14px;
      color: #d4a574;
      font-weight: 500;
      margin-bottom: 16px;
      transition: all 0.3s;
    }
    .url-box:hover { border-color: #d4a574; }
    .btn-group { display: flex; gap: 10px; }
    .btn-copy, .btn-open {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 14px 20px;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-open {
      background: linear-gradient(135deg, #b8956a, #d4a574);
      color: #0a0a0a;
      font-weight: 700;
      box-shadow: 0 0 24px rgba(212,167,116,0.2);
    }
    .btn-copy {
      background: transparent;
      border: 1px solid #d4a574;
      color: #d4a574;
    }
    .btn-copy:active, .btn-open:active { transform: scale(0.96); }
    .note {
      font-size: 12px;
      color: #555;
      margin-top: 20px;
      line-height: 1.8;
    }
    .note strong { color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">💕</div>
    <h1>寻星</h1>
    <p class="subtitle">程序制作人：鸵鸟</p>
    <div class="qr-wrapper">${svg}</div>
    <div class="info">📱 <strong>用微信扫一扫上方二维码</strong><br>或在微信中打开下方链接</div>
    <div class="url-box" id="urlBox">${URL}</div>
    <div class="btn-group">
      <button class="btn-copy" onclick="copyUrl()">📋 复制链接</button>
      <button class="btn-open" onclick="window.open('${URL}')">🔗 打开页面</button>
    </div>
    <p class="note">💡 <strong>使用说明：</strong><br>
      ① 打开链接 → 填写个人信息注册<br>
      ② 浏览「发现」页面找到感兴趣的人<br>
      ③ 点击喜欢 → 互相喜欢即匹配成功<br>
      ④ 匹配后在「匹配」页面查看对方微信号</p>
  </div>
  <script>
    function copyUrl() {
      const url = '${URL}';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => alert('✅ 链接已复制！'));
      } else {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        alert('✅ 链接已复制！');
      }
    }
  </script>
</body>
</html>`;

    const outputPath = path.join(__dirname, 'public', 'qr.html');
    fs.writeFileSync(outputPath, html);
    console.log('✅ 二维码页面已生成: public/qr.html');
    console.log('📱 分享链接:', URL);
  } catch (err) {
    console.error('生成二维码失败:', err);
  }
}

generateQR();
