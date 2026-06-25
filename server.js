const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== Supabase 客户端初始化 ==========
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 缺少环境变量：SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 必须设置');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ========== CORS ==========
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== 健康检查 ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), version: 'v9-supabase' });
});

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
  if (!typesStr) return [];
  if (Array.isArray(typesStr)) return typesStr;
  try { return JSON.parse(typesStr); } catch { return []; }
}

/**
 * 身份验证：通过 userId + token 验证用户身份
 */
async function verifyUser(userId, token) {
  if (!userId || !token) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .eq('access_token', token)
    .maybeSingle();
  return data || null;
}

// ========== API 路由 ==========

/**
 * POST /api/register
 */
app.post('/api/register', async (req, res) => {
  try {
    const { nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id } = req.body;

    if (!nickname || !age || !gender || !orientation || !relationship_types || !wechat_id) {
      return res.status(400).json({ error: '请填写所有必填信息' });
    }
    if (!['男', '女'].includes(gender)) {
      return res.status(400).json({ error: '性别只能选择男或女' });
    }
    const typesArr = Array.isArray(relationship_types) ? relationship_types : JSON.parse(relationship_types || '[]');
    if (typesArr.length === 0) {
      return res.status(400).json({ error: '请至少选择一个想找的关系类型' });
    }

    // 检查微信号是否已注册
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('wechat_id', wechat_id)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: '该微信号已注册，请直接登录查看匹配' });
    }

    const accessToken = generateToken();

    const { data, error } = await supabase
      .from('users')
      .insert({
        nickname,
        age: parseInt(age),
        gender,
        region: region || '',
        constellation: constellation || '',
        mbti: mbti || '',
        orientation,
        relationship_types: JSON.stringify(typesArr),
        wechat_id,
        access_token: accessToken
      })
      .select()
      .single();

    if (error) {
      console.error('注册 DB 错误:', error);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }

    res.json({
      success: true,
      user_id: data.id,
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
app.post('/api/login', async (req, res) => {
  try {
    const { wechat_id } = req.body;
    if (!wechat_id) return res.status(400).json({ error: '请输入微信号' });

    const { data: user, error } = await supabase
      .from('users')
      .select('id, nickname, access_token')
      .eq('wechat_id', wechat_id)
      .maybeSingle();

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
 */
app.get('/api/browse/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { token, type, gender, age_min, age_max } = req.query;

    const currentUser = await verifyUser(userId, token);
    if (!currentUser) return res.status(401).json({ error: '身份验证失败' });

    // 获取所有其他用户
    const { data: allUsers, error } = await supabase
      .from('users')
      .select('id, nickname, age, gender, region, constellation, mbti, orientation, relationship_types, created_at')
      .neq('id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('浏览 DB 错误:', error);
      return res.status(500).json({ error: '服务器错误' });
    }

    // 获取当前用户的点赞列表
    const { data: myLikes } = await supabase
      .from('likes')
      .select('to_user_id')
      .eq('from_user_id', userId);
    const likedUserIds = new Set((myLikes || []).map(l => l.to_user_id));

    // 获取匹配列表
    const { data: myMatches } = await supabase
      .from('matches')
      .select('user1_id, user2_id')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    const matchedUserIds = new Set();
    (myMatches || []).forEach(m => {
      matchedUserIds.add(m.user1_id === parseInt(userId) ? m.user2_id : m.user1_id);
    });

    let browseList = (allUsers || []).map(user => ({
      ...user,
      relationship_types: parseRelationshipTypes(user.relationship_types),
      is_liked: likedUserIds.has(user.id),
      is_matched: matchedUserIds.has(user.id)
    }));

    // 精准匹配筛选
    if (type) {
      const counterpart = COUNTERPART_MAP[type];
      if (!counterpart) {
        return res.status(400).json({ error: `无效的关系类型: ${type}` });
      }

      browseList = browseList.filter(user =>
        user.relationship_types.includes(counterpart)
      );

      if (gender) browseList = browseList.filter(u => u.gender === gender);
      if (age_min) browseList = browseList.filter(u => u.age >= parseInt(age_min));
      if (age_max) browseList = browseList.filter(u => u.age <= parseInt(age_max));

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
 */
app.post('/api/like', async (req, res) => {
  try {
    const { from_user_id, to_user_id, token, relationship_type } = req.body;

    const currentUser = await verifyUser(from_user_id, token);
    if (!currentUser) return res.status(401).json({ error: '身份验证失败，无权进行此操作' });

    if (from_user_id === to_user_id) return res.status(400).json({ error: '不能给自己点赞' });

    // 验证目标用户存在
    const { data: targetUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', to_user_id)
      .maybeSingle();

    if (!targetUser) return res.status(404).json({ error: '该用户已不存在' });

    // 不能重复点赞
    const { data: existingLike } = await supabase
      .from('likes')
      .select('id')
      .eq('from_user_id', from_user_id)
      .eq('to_user_id', to_user_id)
      .maybeSingle();

    if (existingLike) return res.status(400).json({ error: '已经表达过喜欢了' });

    // 记录点赞
    await supabase
      .from('likes')
      .insert({ from_user_id: parseInt(from_user_id), to_user_id: parseInt(to_user_id) });

    // 检查是否双向匹配
    const { data: reverseLike } = await supabase
      .from('likes')
      .select('id')
      .eq('from_user_id', to_user_id)
      .eq('to_user_id', from_user_id)
      .maybeSingle();

    let matched = false, matchId = null, targetWechatId = null, targetNickname = null;

    if (reverseLike) {
      const smaller = Math.min(from_user_id, to_user_id);
      const larger = Math.max(from_user_id, to_user_id);

      // 检查是否已有匹配记录
      const { data: existingMatch } = await supabase
        .from('matches')
        .select('id')
        .eq('user1_id', smaller)
        .eq('user2_id', larger)
        .maybeSingle();

      if (!existingMatch) {
        const { data: newMatch, error: matchError } = await supabase
          .from('matches')
          .insert({ user1_id: smaller, user2_id: larger })
          .select()
          .single();
        matchId = newMatch?.id;
      } else {
        matchId = existingMatch.id;
      }

      // 获取目标用户信息
      const { data: targetInfo } = await supabase
        .from('users')
        .select('wechat_id, nickname')
        .eq('id', to_user_id)
        .maybeSingle();

      targetWechatId = targetInfo?.wechat_id;
      targetNickname = targetInfo?.nickname;

      // 匹配成功 → 存入存档，删除活跃用户
      const { data: user1 } = await supabase.from('users').select('*').eq('id', from_user_id).maybeSingle();
      const { data: user2 } = await supabase.from('users').select('*').eq('id', to_user_id).maybeSingle();

      if (user1 && user2) {
        const snapshot1 = JSON.stringify({
          nickname: user1.nickname, age: user1.age, gender: user1.gender,
          region: user1.region, constellation: user1.constellation, mbti: user1.mbti,
          orientation: user1.orientation, relationship_types: parseRelationshipTypes(user1.relationship_types),
          wechat_id: user1.wechat_id
        });
        const snapshot2 = JSON.stringify({
          nickname: user2.nickname, age: user2.age, gender: user2.gender,
          region: user2.region, constellation: user2.constellation, mbti: user2.mbti,
          orientation: user2.orientation, relationship_types: parseRelationshipTypes(user2.relationship_types),
          wechat_id: user2.wechat_id
        });

        await supabase.from('matched_users').insert({ original_user_id: user1.id, match_id: matchId, snapshot: snapshot1 });
        await supabase.from('matched_users').insert({ original_user_id: user2.id, match_id: matchId, snapshot: snapshot2 });

        // 删除相关的点赞记录
        await supabase.from('likes').delete().eq('from_user_id', from_user_id);
        await supabase.from('likes').delete().eq('from_user_id', to_user_id);
        await supabase.from('likes').delete().eq('to_user_id', from_user_id);
        await supabase.from('likes').delete().eq('to_user_id', to_user_id);

        // 从活跃用户池删除两人
        await supabase.from('users').delete().eq('id', from_user_id);
        await supabase.from('users').delete().eq('id', to_user_id);
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
 */
app.get('/api/matches/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { token } = req.query;

    let currentUser = await verifyUser(userId, token);
    let userExists = !!currentUser;

    // 如果从活跃用户找不到，查存档
    if (!currentUser) {
      const { data: archived } = await supabase
        .from('matched_users')
        .select('snapshot')
        .eq('original_user_id', userId)
        .maybeSingle();

      if (!archived) return res.status(401).json({ error: '身份验证失败' });
      currentUser = { id: parseInt(userId) };
      userExists = false;
    }

    const { data: matches, error } = await supabase
      .from('matches')
      .select('id, user1_id, user2_id, matched_at')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('matched_at', { ascending: false });

    if (error) {
      console.error('匹配列表 DB 错误:', error);
      return res.status(500).json({ error: '服务器错误' });
    }

    const matchDetails = [];

    for (const m of (matches || [])) {
      const partnerId = m.user1_id === parseInt(userId) ? m.user2_id : m.user1_id;

      // 先查活跃 users 表
      let { data: partner } = await supabase
        .from('users')
        .select('id, nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id')
        .eq('id', partnerId)
        .maybeSingle();

      if (!partner) {
        // 从存档读取
        const { data: archivedPartner } = await supabase
          .from('matched_users')
          .select('snapshot')
          .eq('original_user_id', partnerId)
          .maybeSingle();

        if (archivedPartner) {
          const snap = JSON.parse(archivedPartner.snapshot);
          partner = { id: partnerId, ...snap, relationship_types: snap.relationship_types || [] };
        }
      } else {
        partner.relationship_types = parseRelationshipTypes(partner.relationship_types);
      }

      if (partner) {
        matchDetails.push({
          match_id: m.id,
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
 */
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { token } = req.query;

    const user = await verifyUser(userId, token);

    if (!user) {
      // 检查存档
      const { data: archived } = await supabase
        .from('matched_users')
        .select('snapshot')
        .eq('original_user_id', userId)
        .maybeSingle();

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

    const { count: likeCount } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', userId);

    const { count: matchCount } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    res.json({
      success: true, user,
      stats: { likes_received: likeCount || 0, match_count: matchCount || 0 }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * GET /api/my-likes/:userId
 */
app.get('/api/my-likes/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { token } = req.query;
    const currentUser = await verifyUser(userId, token);
    if (!currentUser) return res.status(401).json({ error: '身份验证失败' });

    const { data: likes } = await supabase
      .from('likes')
      .select('to_user_id')
      .eq('from_user_id', userId);

    res.json({ success: true, liked_user_ids: (likes || []).map(l => l.to_user_id) });
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

// ========== 🔑 管理员接口 ==========
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '789wwpvvw';

function verifyAdmin(token) {
  if (!token) return false;
  return token === ADMIN_PASSWORD + '_admin_session';
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const sessionToken = ADMIN_PASSWORD + '_admin_session';
    res.json({ success: true, token: sessionToken });
  } else {
    res.status(401).json({ success: false, error: '密码错误' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  if (!verifyAdmin(req.query.token)) return res.status(401).json({ error: '管理员验证失败' });

  const { data: users, error } = await supabase
    .from('users')
    .select('id, nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: '服务器错误' });

  const parsed = (users || []).map(u => ({ ...u, relationship_types: parseRelationshipTypes(u.relationship_types) }));
  res.json({ success: true, users: parsed, count: parsed.length });
});

app.get('/api/admin/archived', async (req, res) => {
  if (!verifyAdmin(req.query.token)) return res.status(401).json({ error: '管理员验证失败' });

  const { data: archived, error } = await supabase
    .from('matched_users')
    .select('id, original_user_id, match_id, snapshot, matched_at')
    .order('matched_at', { ascending: false });

  if (error) return res.status(500).json({ error: '服务器错误' });

  const parsed = (archived || []).map(a => {
    let snap = {};
    try { snap = JSON.parse(a.snapshot); } catch {}
    return { ...a, snapshot: snap };
  });
  res.json({ success: true, archived: parsed, count: parsed.length });
});

app.get('/api/admin/matches', async (req, res) => {
  if (!verifyAdmin(req.query.token)) return res.status(401).json({ error: '管理员验证失败' });

  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, user1_id, user2_id, matched_at')
    .order('matched_at', { ascending: false });

  if (error) return res.status(500).json({ error: '服务器错误' });

  const detailed = [];
  for (const m of (matches || [])) {
    const { data: u1Archived } = await supabase
      .from('matched_users')
      .select('snapshot')
      .eq('match_id', m.id)
      .eq('original_user_id', m.user1_id)
      .maybeSingle();
    const { data: u2Archived } = await supabase
      .from('matched_users')
      .select('snapshot')
      .eq('match_id', m.id)
      .eq('original_user_id', m.user2_id)
      .maybeSingle();

    let u1 = null, u2 = null;
    if (u1Archived) { try { u1 = JSON.parse(u1Archived.snapshot); } catch {} }
    if (u2Archived) { try { u2 = JSON.parse(u2Archived.snapshot); } catch {} }
    detailed.push({ ...m, user1: u1, user2: u2 });
  }

  res.json({ success: true, matches: detailed, count: detailed.length });
});

app.put('/api/admin/user/:id', async (req, res) => {
  if (!verifyAdmin(req.body.token)) return res.status(401).json({ error: '管理员验证失败' });

  const { id } = req.params;
  const { nickname, age, gender, region, constellation, mbti, orientation, relationship_types, wechat_id } = req.body;

  const { data: user, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!user) return res.status(404).json({ error: '用户不存在' });

  const updateData = {};
  if (nickname !== undefined) updateData.nickname = nickname;
  if (age !== undefined) updateData.age = parseInt(age);
  if (gender !== undefined) updateData.gender = gender;
  if (region !== undefined) updateData.region = region;
  if (constellation !== undefined) updateData.constellation = constellation;
  if (mbti !== undefined) updateData.mbti = mbti;
  if (orientation !== undefined) updateData.orientation = orientation;
  if (relationship_types !== undefined) updateData.relationship_types = JSON.stringify(relationship_types);
  if (wechat_id !== undefined) updateData.wechat_id = wechat_id;

  const { error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', id);

  if (error) return res.status(500).json({ error: '更新失败' });

  res.json({ success: true, message: '用户信息已更新' });
});

app.delete('/api/admin/user/:id', async (req, res) => {
  const { token } = req.body;
  if (!verifyAdmin(token)) return res.status(401).json({ error: '管理员验证失败' });

  const { id } = req.params;
  await supabase.from('likes').delete().eq('from_user_id', id);
  await supabase.from('likes').delete().eq('to_user_id', id);
  await supabase.from('users').delete().eq('id', id);
  res.json({ success: true, message: '用户已删除' });
});

// SPA 回退
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== 本地开发用：启动 HTTP 服务 ==========
if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n╔══════════════════════════════════════════╗
║   💫 寻星 v9 — Supabase 版                ║
║   🌐 数据库: Supabase PostgreSQL           ║
║   🔒 权限控制 + 自动清理                ║
║   🔑 管理员入口: /admin.html            ║
║   地址: http://localhost:${PORT}              ║
╚══════════════════════════════════════════╝`);
  });

  server.on('error', (err) => {
    console.error('❌ 服务器启动失败:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`   端口 ${PORT} 已被占用`);
    }
    process.exit(1);
  });
}

// ========== Vercel 部署用：导出 app ==========
module.exports = app;
