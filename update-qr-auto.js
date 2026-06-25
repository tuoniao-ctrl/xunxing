const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getTunnelUrl() {
  try {
    const logs = execSync('pm2 logs wechat-tunnel --lines 100 --nostream 2>&1', { encoding: 'utf8', timeout: 5000 });
    const match = logs.match(/([a-z0-9]+\.lhr\.life)/);
    return match ? `https://${match[1]}` : null;
  } catch {
    return null;
  }
}

const URL = getTunnelUrl() || 'https://2fe9f2cffa5870.lhr.life';
console.log('Using URL:', URL);

async function generate() {
  const svg = await QRCode.toString(URL, { type: 'svg', width: 300, margin: 2, color: { dark: '#FF6B6B', light: '#FFFFFF' } });
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>💕 缘分匹配 - 扫码入口</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; background: linear-gradient(135deg, #FFF5F5 0%, #FFF0E8 50%, #FFF5F5 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .container { background: white; border-radius: 24px; padding: 40px 30px; box-shadow: 0 20px 60px rgba(255,107,107,0.15); text-align: center; max-width: 420px; width: 100%; }
    .logo { font-size: 48px; margin-bottom: 12px; }
    h1 { font-size: 26px; font-weight: 800; background: linear-gradient(135deg, #FF6B6B, #FF8E53); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 8px; }
    .subtitle { color: #9CA3AF; font-size: 14px; margin-bottom: 28px; }
    .qr-wrapper { background: white; border-radius: 16px; padding: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.06); margin-bottom: 24px; }
    .qr-wrapper svg { display: block; }
    .info { font-size: 14px; color: #6B7280; margin-bottom: 16px; line-height: 1.8; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 12px 16px; }
    .url-box { background: #F9FAFB; border: 2px dashed #E5E7EB; border-radius: 12px; padding: 14px 16px; word-break: break-all; font-size: 14px; color: #FF6B6B; font-weight: 500; margin-bottom: 16px; }
    .btn-group { display: flex; gap: 10px; }
    .btn-copy, .btn-open { flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.3s; }
    .btn-open { background: linear-gradient(135deg, #FF6B6B, #FF8E53); color: white; box-shadow: 0 4px 16px rgba(255,107,107,0.3); }
    .btn-copy { background: white; border: 2px solid #FF6B6B; color: #FF6B6B; }
    .btn-copy:active, .btn-open:active { transform: scale(0.96); }
    .note { font-size: 12px; color: #9CA3AF; margin-top: 20px; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">💕</div>
    <h1>缘分匹配</h1>
    <p class="subtitle">微信扫码或点击链接，找到你的专属缘分</p>
    <div class="qr-wrapper">${svg}</div>
    <div class="info">📱 <strong>用微信扫一扫上方二维码</strong><br>或在微信中打开下方链接</div>
    <div class="url-box" id="urlBox">${URL}</div>
    <div class="btn-group">
      <button class="btn-copy" onclick="navigator.clipboard.writeText('${URL}').then(()=>alert('✅ 已复制'))">📋 复制链接</button>
      <button class="btn-open" onclick="window.open('${URL}')">🔗 打开页面</button>
    </div>
    <p class="note">💡 <strong>使用说明：</strong><br>① 打开链接 → 填写个人信息注册<br>② 浏览「发现」页面找到感兴趣的人<br>③ 点击喜欢 → 互相喜欢即匹配成功<br>④ 匹配后在「匹配」页面查看对方微信号</p>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(__dirname, 'public', 'qr.html'), html);
  console.log('✅ QR updated to:', URL);
}

generate();
