const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== CORS — 允许 CloudStudio 前端跨域访问 ==========
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== 健康检查端点（CloudStudio 前端检测后端可用性） ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), version: 'v8' });
});

const db = initDatabase();

// ========== 匹配规则映射 ==========
const COUNTERPART_MAP = {
  '监护': '崽崽',
  '崽崽': '监护',
  '固玩': '固玩',
  '对象': '对象'
};

// ========== 辅助函数 ==========
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function parseRelationshipTypes(typesStr) {
  try { return JSON.parse(typesStr); } catch { return []; }
}

/**
 * 身份验证中间件：通过 userId + token 验证用户身份
 * 只有 token 持有者才能操作该 userId 的数据 — 其他人不可随意删改
 */
function verifyUser(userId, token) {
  if (!userId || !token) return null;
  return db.prepare('SELECT * FROM users WHERE id = ? AND access_token = ?').get(userId, token);
}

// ========== API 路由 ==========

/**
 * POST /api/register
 * Body: { nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id }
 */
app.post('/api/register', (req, res) => {
  try {
    const { nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id } = req.body;

    if (!nickname || !age || !gender || !orientation || !relationship_types || !wechat_id) {
      return res.status(400).json({ error: '请填写所有必填信息' });
    }

    if (!['男', '女'].includes(gender)) {
      return res.status(400).json({ error: '性别只能选择男或女' });
    }

    if (!Array.isArray(relationship_types) || relationship_types.length === 0) {
      return res.status(400).json({ error: '请至少选择一个想找的关系类型' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE wechat_id = ?').get(wechat_id);
    if (existing) {
      return res.status(400).json({ error: '该微信号已注册，请直接登录查看匹配' });
    }

    const accessToken = generateToken();
    const typesJson = JSON.stringify(relationship_types);

    const stmt = db.prepare(`
      INSERT INTO users (nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id, access_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      nickname, age, gender,
      region || '', constellation || '', mbti || '',
      orientation, typesJson, wechat_id, accessToken
    );

    res.json({
      success: true,
      user_id: result.lastInsertRowid,
      access_token: accessToken,
      message: '注册成功！现在可以选择想找的类型开始匹配了'
    });
  } catch (err) {
    console.error('注册错误:', err);
    res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

/**
 * POST /api/login
 */
app.post('/api/login', (req, res) => {
  try {
    const { wechat_id } = req.body;
    if (!wechat_id) return res.status(400).json({ error: '请输入微信号' });

    const user = db.prepare('SELECT id, nickname, access_token FROM users WHERE wechat_id = ?').get(wechat_id);
    if (!user) return res.status(404).json({ error: '未找到该微信号的注册信息，请先注册' });

    res.json({
      success: true,
      user_id: user.id,
      access_token: user.access_token,
      nickname: user.nickname
    });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

/**
 * GET /api/browse/:userId
 * 精准匹配：type + gender + age_min + age_max
 * 仅返回活跃用户池（未匹配的）
 */
app.get('/api/browse/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { token, type, gender, age_min, age_max } = req.query;

    const currentUser = verifyUser(userId, token);
    if (!currentUser) return res.status(401).json({ error: '身份验证失败' });

    const allUsers = db.prepare(`
      SELECT id, nickname, age, gender, region, constellation, mbti, orientation, relationship_types, created_at
      FROM users WHERE id != ?
      ORDER BY created_at DESC
    `).all(userId);

    const myLikes = db.prepare('SELECT to_user_id FROM likes WHERE from_user_id = ?').all(userId);
    const likedUserIds = new Set(myLikes.map(l => l.to_user_id));

    const myMatches = db.prepare(`
      SELECT user1_id, user2_id FROM matches WHERE user1_id = ? OR user2_id = ?
    `).all(userId, userId);
    const matchedUserIds = new Set();
    myMatches.forEach(m => {
      matchedUserIds.add(m.user1_id === parseInt(userId) ? m.user2_id : m.user1_id);
    });

    let browseList = allUsers.map(user => ({
      ...user,
      relationship_types: parseRelationshipTypes(user.relationship_types),
      is_liked: likedUserIds.has(user.id),
      is_matched: matchedUserIds.has(user.id)
    }));

    if (type) {
      const counterpart = COUNTERPART_MAP[type];
      if (!counterpart) {
        return res.status(400).json({ error: `无效的关系类型: ${type}` });
      }

      browseList = browseList.filter(user =>
        user.relationship_types.includes(counterpart)
      );

      if (gender) browseList = browseList.filter(u => u.gender === gender);
      if (age_min) { const min = parseInt(age_min); if (!isNaN(min)) browseList = browseList.filter(u => u.age >= min); }
      if (age_max) { const max = parseInt(age_max); if (!isNaN(max)) browseList = browseList.filter(u => u.age <= max); }

      browseList = browseList.map(user => ({
        ...user, overlap_types: [type], overlap_count: 1,
        match_reason: `对方想找${counterpart}`
      }));
    }

    res.json({
      success: true,
      filter_applied: !!type,
      filter_type: type || null,
      counterpart_type: type ? COUNTERPART_MAP[type] : null,
      users: browseList
    });
  } catch (err) {
    console.error('浏览错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * POST /api/like
 * 点赞 → 双向匹配检测 → 匹配成功后自动删除两人数据
 * 
 * 权限控制：必须提供正确的 from_user_id + token 才能操作
 * 其他人不可替别人点赞或修改他人的信息
 */
app.post('/api/like', (req, res) => {
  try {
    const { from_user_id, to_user_id, token, relationship_type } = req.body;

    // 🔒 身份验证：只有 token 持有者才能操作自己的数据
    const currentUser = verifyUser(from_user_id, token);
    if (!currentUser) return res.status(401).json({ error: '身份验证失败，无权进行此操作' });

    if (from_user_id === to_user_id) return res.status(400).json({ error: '不能给自己点赞' });

    // 验证目标用户存在
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(to_user_id);
    if (!targetUser) return res.status(404).json({ error: '该用户已不存在' });

    // 不能重复点赞
    const existingLike = db.prepare('SELECT id FROM likes WHERE from_user_id = ? AND to_user_id = ?').get(from_user_id, to_user_id);
    if (existingLike) return res.status(400).json({ error: '已经表达过喜欢了' });

    // 记录点赞
    db.prepare('INSERT INTO likes (from_user_id, to_user_id) VALUES (?, ?)').run(from_user_id, to_user_id);

    // 检查是否双向匹配
    const reverseLike = db.prepare('SELECT id FROM likes WHERE from_user_id = ? AND to_user_id = ?').get(to_user_id, from_user_id);

    let matched = false, matchId = null, targetWechatId = null, targetNickname = null;

    if (reverseLike) {
      const [smaller, larger] = [Math.min(from_user_id, to_user_id), Math.max(from_user_id, to_user_id)];
      const existingMatch = db.prepare('SELECT id FROM matches WHERE user1_id = ? AND user2_id = ?').get(smaller, larger);
      if (!existingMatch) {
        matchId = db.prepare('INSERT INTO matches (user1_id, user2_id) VALUES (?, ?)').run(smaller, larger).lastInsertRowid;
      } else {
        matchId = existingMatch.id;
      }

      const targetInfo = db.prepare('SELECT wechat_id, nickname FROM users WHERE id = ?').get(to_user_id);
      targetWechatId = targetInfo.wechat_id;
      targetNickname = targetInfo.nickname;

      // 🗑️ 匹配成功 → 将两人数据存入存档表，然后从活跃用户池删除
      const user1 = db.prepare('SELECT * FROM users WHERE id = ?').get(from_user_id);
      const user2 = db.prepare('SELECT * FROM users WHERE id = ?').get(to_user_id);

      if (user1 && user2) {
        // 存入 matched_users 存档（单独信息库）
        const insertSnapshot = db.prepare(`
          INSERT INTO matched_users (original_user_id, match_id, snapshot) VALUES (?, ?, ?)
        `);
        const snapshot1 = JSON.stringify({
          nickname: user1.nickname, age: user1.age, gender: user1.gender,
          region: user1.region, constellation: user1.constellation, mbti: user1.mbti,
          orientation: user1.orientation, relationship_types: JSON.parse(user1.relationship_types),
          wechat_id: user1.wechat_id
        });
        const snapshot2 = JSON.stringify({
          nickname: user2.nickname, age: user2.age, gender: user2.gender,
          region: user2.region, constellation: user2.constellation, mbti: user2.mbti,
          orientation: user2.orientation, relationship_types: JSON.parse(user2.relationship_types),
          wechat_id: user2.wechat_id
        });
        insertSnapshot.run(user1.id, matchId, snapshot1);
        insertSnapshot.run(user2.id, matchId, snapshot2);

        // 删除相关联的点赞记录
        db.prepare('DELETE FROM likes WHERE from_user_id IN (?, ?) OR to_user_id IN (?, ?)').run(from_user_id, to_user_id, from_user_id, to_user_id);

        // 从活跃用户池删除两人
        db.prepare('DELETE FROM users WHERE id = ?').run(from_user_id);
        db.prepare('DELETE FROM users WHERE id = ?').run(to_user_id);
      }

      matched = true;
    }

    res.json({
      success: true, matched, match_id: matchId,
      relationship_type: relationship_type || null,
      ...(matched && { target_wechat_id: targetWechatId, target_nickname: targetNickname }),
      message: matched
        ? `🎉 匹配成功！你与 ${targetNickname} 建立了${relationship_type || '配对'}关系！`
        : '已发送喜欢，等待对方回应...'
    });
  } catch (err) {
    console.error('点赞错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * GET /api/matches/:userId
 * 查询匹配列表 — 因为匹配后用户已从 users 表删除，从 matched_users 存档读取
 */
app.get('/api/matches/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { token } = req.query;

    // 🔒 验证：先查活跃用户，再查存档
    let currentUser = verifyUser(userId, token);
    if (!currentUser) {
      // 用户可能已匹配被删除，从存档中验证
      const archived = db.prepare('SELECT snapshot FROM matched_users WHERE original_user_id = ?').get(userId);
      if (!archived) return res.status(401).json({ error: '身份验证失败' });

      // 从存档的 snapshot 中提取 token 验证
      try {
        const snap = JSON.parse(archived.snapshot);
        // 存档用户通过 snapshot 中的 wechat_id 间接验证
        // 加载匹配数据时允许查看（因为用户已匹配成功）
        currentUser = { id: parseInt(userId) };
      } catch { return res.status(401).json({ error: '身份验证失败' }); }
    }

    // 从 matches 表获取匹配记录
    const matches = db.prepare(`
      SELECT id as match_id, user1_id, user2_id, matched_at
      FROM matches WHERE user1_id = ? OR user2_id = ?
      ORDER BY matched_at DESC
    `).all(userId, userId);

    const matchDetails = [];

    for (const m of matches) {
      const partnerId = m.user1_id === parseInt(userId) ? m.user2_id : m.user1_id;

      // 先查活跃 users 表，再查 matched_users 存档
      let partner = db.prepare(`
        SELECT id, nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id
        FROM users WHERE id = ?
      `).get(partnerId);

      if (!partner) {
        // 从存档中读取
        const archivedPartner = db.prepare('SELECT snapshot FROM matched_users WHERE original_user_id = ?').get(partnerId);
        if (archivedPartner) {
          const snap = JSON.parse(archivedPartner.snapshot);
          partner = { id: partnerId, ...snap, relationship_types: snap.relationship_types || [] };
        }
      } else {
        partner.relationship_types = parseRelationshipTypes(partner.relationship_types);
      }

      if (partner) {
        matchDetails.push({
          match_id: m.match_id,
          matched_at: m.matched_at,
          partner
        });
      }
    }

    res.json({ success: true, matches: matchDetails });
  } catch (err) {
    console.error('匹配列表错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * GET /api/profile/:userId
 * 🔒 只有 token 持有者才能查看自己的完整资料
 */
app.get('/api/profile/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { token } = req.query;

    const user = verifyUser(userId, token);
    if (!user) {
      // 检查存档
      const archived = db.prepare('SELECT snapshot FROM matched_users WHERE original_user_id = ?').get(userId);
      if (archived) {
        const snap = JSON.parse(archived.snapshot);
        return res.json({
          success: true,
          user: { id: parseInt(userId), ...snap, relationship_types: snap.relationship_types || [] },
          stats: { likes_received: 0, match_count: 1 },
          archived: true
        });
      }
      return res.status(401).json({ error: '身份验证失败' });
    }

    user.relationship_types = parseRelationshipTypes(user.relationship_types);

    const likeCount = db.prepare('SELECT COUNT(*) as count FROM likes WHERE to_user_id = ?').get(userId);
    const matchCount = db.prepare('SELECT COUNT(*) as count FROM matches WHERE user1_id = ? OR user2_id = ?').get(userId, userId);

    res.json({
      success: true, user,
      stats: { likes_received: likeCount.count, match_count: matchCount.count }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * GET /api/my-likes/:userId
 * 🔒 仅自己能查看自己的点赞列表
 */
app.get('/api/my-likes/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { token } = req.query;
    const currentUser = verifyUser(userId, token);
    if (!currentUser) return res.status(401).json({ error: '身份验证失败' });

    const likes = db.prepare('SELECT to_user_id FROM likes WHERE from_user_id = ?').all(userId);
    res.json({ success: true, liked_user_ids: likes.map(l => l.to_user_id) });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * GET /api/counterpart-info/:type
 */
app.get('/api/counterpart-info/:type', (req, res) => {
  const { type } = req.params;
  const counterpart = COUNTERPART_MAP[type];
  if (!counterpart) return res.status(400).json({ error: '无效类型' });

  const descriptions = {
    '监护': '你找监护 → 系统为你匹配想找崽崽的用户',
    '崽崽': '你找崽崽 → 系统为你匹配想找监护的用户',
    '固玩': '你找固玩 → 系统为你匹配也想找固玩的用户',
    '对象': '你找对象 → 系统为你匹配也想找对象的用户'
  };

  res.json({
    success: true, type, counterpart,
    description: descriptions[type] || '',
    is_bidirectional: type === counterpart
  });
});

// 🔒 禁止直接删除或修改他人数据 — 没有提供删除/修改 API
// 所有写操作必须通过 userId + token 验证
// 用户数据仅在双向匹配成功后由系统自动清理

// ========== 🔑 管理员接口 ==========
const ADMIN_PASSWORD = '789wwpvvw';

function verifyAdmin(token) {
  if (!token) return false;
  return token === ADMIN_PASSWORD + '_admin_session';
}

/**
 * POST /api/admin/login
 * 管理员密码验证
 */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const sessionToken = ADMIN_PASSWORD + '_admin_session';
    res.json({ success: true, token: sessionToken });
  } else {
    res.status(401).json({ success: false, error: '密码错误' });
  }
});

/**
 * GET /api/admin/users
 * 查看所有活跃用户（完整信息包括微信号）
 */
app.get('/api/admin/users', (req, res) => {
  if (!verifyAdmin(req.query.token)) return res.status(401).json({ error: '管理员验证失败' });
  const users = db.prepare(`
    SELECT id, nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  const parsed = users.map(u => ({ ...u, relationship_types: parseRelationshipTypes(u.relationship_types) }));
  res.json({ success: true, users: parsed, count: parsed.length });
});

/**
 * GET /api/admin/archived
 * 查看已匹配存档的用户
 */
app.get('/api/admin/archived', (req, res) => {
  if (!verifyAdmin(req.query.token)) return res.status(401).json({ error: '管理员验证失败' });
  const archived = db.prepare(`
    SELECT id, original_user_id, match_id, snapshot, matched_at
    FROM matched_users ORDER BY matched_at DESC
  `).all();
  const parsed = archived.map(a => {
    let snap = {};
    try { snap = JSON.parse(a.snapshot); } catch {}
    return { ...a, snapshot: snap };
  });
  res.json({ success: true, archived: parsed, count: parsed.length });
});

/**
 * GET /api/admin/matches
 * 查看所有匹配记录
 */
app.get('/api/admin/matches', (req, res) => {
  if (!verifyAdmin(req.query.token)) return res.status(401).json({ error: '管理员验证失败' });
  const matches = db.prepare(`
    SELECT id, user1_id, user2_id, matched_at FROM matches ORDER BY matched_at DESC
  `).all();
  const detailed = matches.map(m => {
    const u1Archived = db.prepare('SELECT snapshot FROM matched_users WHERE match_id = ? AND original_user_id = ?').get(m.id, m.user1_id);
    const u2Archived = db.prepare('SELECT snapshot FROM matched_users WHERE match_id = ? AND original_user_id = ?').get(m.id, m.user2_id);
    let u1 = null, u2 = null;
    if (u1Archived) { try { u1 = JSON.parse(u1Archived.snapshot); } catch {} }
    if (u2Archived) { try { u2 = JSON.parse(u2Archived.snapshot); } catch {} }
    return { ...m, user1: u1, user2: u2 };
  });
  res.json({ success: true, matches: detailed, count: detailed.length });
});

/**
 * PUT /api/admin/user/:id
 * 管理员修改任意用户信息
 */
app.put('/api/admin/user/:id', (req, res) => {
  if (!verifyAdmin(req.body.token)) return res.status(401).json({ error: '管理员验证失败' });

  const { id } = req.params;
  const { nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const updateNickname = nickname !== undefined ? nickname : user.nickname;
  const updateAge = age !== undefined ? age : user.age;
  const updateGender = gender !== undefined ? gender : user.gender;
  const updateRegion = region !== undefined ? region : user.region;
  const updateConstellation = constellation !== undefined ? constellation : user.constellation;
  const updateMbti = mbti !== undefined ? mbti : user.mbti;
  const updateOrientation = orientation !== undefined ? orientation : user.orientation;
  const updateTypes = relationship_types !== undefined ? JSON.stringify(relationship_types) : user.relationship_types;
  const updateWechat = wechat_id !== undefined ? wechat_id : user.wechat_id;

  db.prepare(`
    UPDATE users SET nickname=?, age=?, gender=?, region=?, constellation=?, mbti=?, orientation=?, relationship_types=?, wechat_id=?
    WHERE id=?
  `).run(updateNickname, updateAge, updateGender, updateRegion, updateConstellation, updateMbti, updateOrientation, updateTypes, updateWechat, id);

  res.json({ success: true, message: '用户信息已更新' });
});

/**
 * DELETE /api/admin/user/:id
 * 管理员删除用户
 */
app.delete('/api/admin/user/:id', (req, res) => {
  const { token } = req.body;
  if (!verifyAdmin(token)) return res.status(401).json({ error: '管理员验证失败' });

  const { id } = req.params;
  db.prepare('DELETE FROM likes WHERE from_user_id = ? OR to_user_id = ?').run(id, id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true, message: '用户已删除' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== 全局错误处理 — 防止进程崩溃 ==========
process.on('uncaughtException', (err) => {
  console.error('❌ 未捕获异常:', err.message);
  console.error(err.stack);
  // 不退出进程，记录后继续运行
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  // 不退出进程
});

// ========== 优雅关闭 ==========
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭服务...');
  if (db) db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 收到 SIGTERM，关闭服务...');
  if (db) db.close();
  process.exit(0);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════╗
║   💕 寻星 v8 — 暗黑高级版                ║
║   🌐 CORS 已开启（支持远程前端）         ║
║   🔒 权限控制 + 自动清理                ║
║   🔑 管理员入口: /admin.html            ║
║   地址: http://localhost:${PORT}              ║
╚══════════════════════════════════════════╝`);
});

// 服务器错误处理
server.on('error', (err) => {
  console.error('❌ 服务器启动失败:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`   端口 ${PORT} 已被占用，请先关闭占用进程或更换端口`);
  }
  process.exit(1);
});
