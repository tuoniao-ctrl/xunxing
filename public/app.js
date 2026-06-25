// ========== API 连接配置 ==========
// 自动检测：如果页面来自 CloudStudio（非本地），使用远程后端
const isCloudStudio = !window.location.hostname.includes('localhost') &&
  !window.location.hostname.includes('127.0.0.1') &&
  !window.location.hostname.includes('lhr.life');
// 后端地址 — CloudStudio 部署时设为当前隧道 URL
const TUNNEL_URL = 'https://dfa6dc5f136bbf.lhr.life';
const API_BASE = isCloudStudio ? TUNNEL_URL : '';

function api(path, options = {}) {
  // 优先使用用户自定义的后端地址，否则用默认的
  const customUrl = localStorage.getItem('backend_url');
  const base = customUrl || API_BASE;
  const url = base + path;
  return fetch(url, options);
}

// ========== 匹配规则 ==========
const MATCH_RULES = {
  '固玩': { counterpart: '固玩', desc: '找固玩 → 匹配也想找固玩的人', icon: '🎮' },
  '监护': { counterpart: '崽崽', desc: '找监护 → 匹配想找崽崽的人', icon: '🛡️' },
  '崽崽': { counterpart: '监护', desc: '找崽崽 → 匹配想找监护的人', icon: '🍼' },
  '对象': { counterpart: '对象', desc: '找对象 → 匹配也想找对象的人', icon: '💝' }
};

const CONSTELLATION_EMOJI = {
  '白羊座':'♈','金牛座':'♉','双子座':'♊','巨蟹座':'♋',
  '狮子座':'♌','处女座':'♍','天秤座':'♎','天蝎座':'♏',
  '射手座':'♐','摩羯座':'♑','水瓶座':'♒','双鱼座':'♓'
};

// ========== 全局状态 ==========
const STATE = {
  userId: null, accessToken: null, nickname: null,
  currentTab: 'browse', authTab: 'register',
  registerData: { gender: null, orientation: null, relationshipTypes: [] },
  filterType: null, filterGender: null, filterAgeMin: null, filterAgeMax: null,
  myTypes: [], isFirstBrowse: true,
  // 确认弹窗待处理数据
  pendingLike: { targetUserId: null, targetNickname: null, btn: null }
};

// ========== 背景粒子 ==========
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('match_user');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      STATE.userId = data.userId;
      STATE.accessToken = data.accessToken;
      STATE.nickname = data.nickname;
      STATE.myTypes = data.myTypes || [];
      STATE.isFirstBrowse = false;
      showMainApp();
    } catch (e) { localStorage.removeItem('match_user'); }
  }
  initBgCanvas();
});

function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      r: 1 + Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: 0.15 + Math.random() * 0.4
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach((p, i) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212,167,116,${p.alpha})`;
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const dx = p.x - particles[j].x;
        const dy = p.y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(212,167,116,${0.04 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ========== Toast ==========
let toastTimer;
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 2500);
}

// ========== 选项选择 ==========
function selectOption(btn, groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  if (groupId === 'regGender') STATE.registerData.gender = btn.dataset.value;
  if (groupId === 'regOrientation') STATE.registerData.orientation = btn.dataset.value;
}

function toggleMultiOption(btn, groupId) {
  btn.classList.toggle('selected');
  const group = document.getElementById(groupId);
  if (!group) return;
  STATE.registerData.relationshipTypes = Array.from(group.querySelectorAll('.multi-btn.selected')).map(b => b.dataset.value);
}

function selectFilterOption(btn, groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

// ========== 登录/注册切换 ==========
function switchAuthTab(tab) {
  STATE.authTab = tab;
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.includes(tab === 'register' ? '注册' : '登录'));
  });
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
}

// ========== 注册 ==========
async function handleRegister() {
  const nickname = document.getElementById('regNickname').value.trim();
  const ageStr = document.getElementById('regAge').value.trim();
  const region = document.getElementById('regRegion').value.trim();
  const constellation = document.getElementById('regConstellation').value;
  const mbti = document.getElementById('regMbti').value;
  const wechatId = document.getElementById('regWechat').value.trim();

  if (!nickname) return showToast('请输入昵称', 'error');
  if (!ageStr) return showToast('请输入年龄', 'error');
  const age = parseInt(ageStr);
  if (isNaN(age) || age < 1 || age > 120) return showToast('请输入有效年龄（1-120）', 'error');
  if (!STATE.registerData.gender) return showToast('请选择性别', 'error');
  if (!STATE.registerData.orientation) return showToast('请选择性取向', 'error');
  if (STATE.registerData.relationshipTypes.length === 0) return showToast('请至少选择一个想找的关系类型', 'error');
  if (!wechatId) return showToast('请输入微信号', 'error');

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '注册中...';

  try {
    const response = await api('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname, age,
        gender: STATE.registerData.gender,
        region, constellation, mbti,
        orientation: STATE.registerData.orientation,
        relationship_types: STATE.registerData.relationshipTypes,
        wechat_id: wechatId
      })
    });

    const data = await response.json();
    if (data.success) {
      STATE.userId = data.user_id;
      STATE.accessToken = data.access_token;
      STATE.nickname = nickname;
      STATE.myTypes = [...STATE.registerData.relationshipTypes];
      STATE.isFirstBrowse = true;
      localStorage.setItem('match_user', JSON.stringify({
        userId: data.user_id, accessToken: data.access_token, nickname, myTypes: STATE.myTypes
      }));
      showToast('🎉 注册成功！', 'success');
      showMainApp();
    } else {
      showToast(data.error || '注册失败', 'error');
    }
  } catch (err) {
    showToast('网络错误，请稍后再试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ 立即注册，开启缘分';
  }
}

// ========== 登录 ==========
async function handleLogin() {
  const wechatId = document.getElementById('loginWechat').value.trim();
  if (!wechatId) return showToast('请输入微信号', 'error');
  const btn = event.target;
  btn.disabled = true; btn.textContent = '登录中...';

  try {
    const response = await api('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wechat_id: wechatId })
    });
    const data = await response.json();
    if (data.success) {
      STATE.userId = data.user_id;
      STATE.accessToken = data.access_token;
      STATE.nickname = data.nickname;
      STATE.isFirstBrowse = false;
      try {
        const pr = await api(`/api/profile/${data.user_id}?token=${data.access_token}`);
        const pd = await pr.json();
        if (pd.success) STATE.myTypes = pd.user.relationship_types || [];
      } catch (e) { STATE.myTypes = []; }
      localStorage.setItem('match_user', JSON.stringify({
        userId: data.user_id, accessToken: data.access_token, nickname: data.nickname, myTypes: STATE.myTypes
      }));
      showToast(`欢迎回来，${data.nickname}！`, 'success');
      showMainApp();
    } else {
      showToast(data.error || '登录失败', 'error');
    }
  } catch (err) {
    showToast('网络错误', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '🔑 登录查看匹配';
  }
}

// ========== 主应用 ==========
function showMainApp() {
  document.getElementById('page-auth').style.display = 'none';
  document.getElementById('tabBar').style.display = 'flex';
  if (STATE.isFirstBrowse) {
    switchTab('browse');
    setTimeout(() => showTypeModal(), 400);
  } else {
    switchTab('browse');
  }
}

function switchTab(tab) {
  STATE.currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ['page-browse','page-matches','page-profile'].forEach(id => document.getElementById(id).style.display = 'none');
  switch (tab) {
    case 'browse':
      document.getElementById('page-browse').style.display = 'block';
      renderFilterBar();
      if (STATE.filterType) loadBrowseList();
      break;
    case 'matches':
      document.getElementById('page-matches').style.display = 'block';
      loadMatchesList();
      break;
    case 'profile':
      document.getElementById('page-profile').style.display = 'block';
      loadProfile();
      break;
  }
}

// ========== 步骤1：关系类型选择 ==========
function showTypeModal() {
  const modal = document.getElementById('typeModal');
  const optionsEl = document.getElementById('typeOptions');
  optionsEl.innerHTML = '';
  if (STATE.myTypes.length === 0) { modal.style.display = 'none'; return; }
  if (STATE.myTypes.length === 1) {
    modal.style.display = 'none';
    STATE.filterType = STATE.myTypes[0];
    STATE.isFirstBrowse = false;
    renderFilterBar();
    showFilterModal();
    return;
  }
  STATE.myTypes.forEach(type => {
    const rule = MATCH_RULES[type] || {};
    const btn = document.createElement('button');
    btn.className = 'option-btn type-option-btn';
    btn.innerHTML = `<span class="type-option-icon">${rule.icon||'💫'}</span><span class="type-option-text"><strong>找${type}</strong><small>${rule.desc||''}</small></span>`;
    btn.onclick = () => {
      STATE.filterType = type; STATE.isFirstBrowse = false;
      modal.style.display = 'none'; renderFilterBar();
      setTimeout(() => showFilterModal(), 300);
    };
    optionsEl.appendChild(btn);
  });
  modal.style.display = 'flex';
}

// ========== 步骤2：筛选弹窗 ==========
function showFilterModal() {
  const modal = document.getElementById('filterModal');
  const rule = MATCH_RULES[STATE.filterType] || {};
  document.getElementById('filterModalTitle').textContent = `找${STATE.filterType||''} — 对方条件`;
  document.getElementById('filterModalSubtitle').textContent = rule.desc || '';
  document.querySelectorAll('#filterGender .option-btn').forEach(b => b.classList.remove('selected'));
  if (STATE.filterGender) {
    const btn = document.querySelector(`#filterGender .option-btn[data-value="${STATE.filterGender}"]`);
    if (btn) btn.classList.add('selected');
  }
  document.getElementById('ageMin').value = STATE.filterAgeMin || 18;
  document.getElementById('ageMax').value = STATE.filterAgeMax || 99;
  modal.style.display = 'flex';
}

function applyFilter() {
  const gb = document.querySelector('#filterGender .option-btn.selected');
  STATE.filterGender = gb ? gb.dataset.value : null;
  const amin = parseInt(document.getElementById('ageMin').value);
  const amax = parseInt(document.getElementById('ageMax').value);
  STATE.filterAgeMin = isNaN(amin) || amin < 1 ? null : amin;
  STATE.filterAgeMax = isNaN(amax) || amax > 120 ? null : amax;
  if (STATE.filterAgeMin && STATE.filterAgeMax && STATE.filterAgeMin > STATE.filterAgeMax) {
    [STATE.filterAgeMin, STATE.filterAgeMax] = [STATE.filterAgeMax, STATE.filterAgeMin];
  }
  document.getElementById('filterModal').style.display = 'none';
  renderFilterBar(); loadBrowseList();
}

function skipFilter() {
  STATE.filterGender = null; STATE.filterAgeMin = null; STATE.filterAgeMax = null;
  document.getElementById('filterModal').style.display = 'none';
  renderFilterBar(); loadBrowseList();
}

// ========== 筛选栏 ==========
function renderFilterBar() {
  const bar = document.getElementById('filterCurrentText');
  const switcher = document.getElementById('filterSwitcher');
  const conditions = document.getElementById('filterConditions');
  const chipGender = document.getElementById('chipGender');
  const chipAge = document.getElementById('chipAge');

  if (STATE.filterType) {
    bar.textContent = `🎯 正在找：${STATE.filterType}`;
  } else {
    bar.textContent = '请选择关系类型开始匹配';
  }

  if (STATE.myTypes.length > 1) {
    switcher.innerHTML = '';
    STATE.myTypes.forEach(type => {
      if (type === STATE.filterType) return;
      const rule = MATCH_RULES[type] || {};
      const chip = document.createElement('button');
      chip.className = 'filter-switch-chip';
      chip.textContent = `${rule.icon||''} 找${type}`;
      chip.onclick = () => {
        STATE.filterType = type; STATE.filterGender = null; STATE.filterAgeMin = null; STATE.filterAgeMax = null;
        renderFilterBar(); showFilterModal();
      };
      switcher.appendChild(chip);
    });
  } else { switcher.innerHTML = ''; }

  if (STATE.filterGender || (STATE.filterAgeMin && STATE.filterAgeMax)) {
    conditions.style.display = 'flex';
    chipGender.style.display = STATE.filterGender ? 'inline-flex' : 'none';
    if (STATE.filterGender) chipGender.textContent = STATE.filterGender === '男' ? '♂ 男' : '♀ 女';
    chipAge.style.display = (STATE.filterAgeMin || STATE.filterAgeMax) ? 'inline-flex' : 'none';
    if (STATE.filterAgeMin && STATE.filterAgeMax) chipAge.textContent = `🎂 ${STATE.filterAgeMin}~${STATE.filterAgeMax}岁`;
    else if (STATE.filterAgeMin) chipAge.textContent = `🎂 ≥${STATE.filterAgeMin}岁`;
    else if (STATE.filterAgeMax) chipAge.textContent = `🎂 ≤${STATE.filterAgeMax}岁`;
  } else { conditions.style.display = 'none'; }
}

// ========== 浏览列表 ==========
async function loadBrowseList() {
  const listEl = document.getElementById('browseList');
  const emptyEl = document.getElementById('browseEmpty');
  if (!STATE.filterType) {
    emptyEl.style.display = 'block';
    emptyEl.querySelector('.empty-text').textContent = '请先选择关系类型';
    emptyEl.querySelector('.empty-hint').textContent = '在上方选择你想找的关系类型，系统为你精准匹配';
    listEl.innerHTML = ''; listEl.appendChild(emptyEl); return;
  }
  listEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p class="loading-text">正在匹配中...</p></div>';

  let url = `/api/browse/${STATE.userId}?token=${STATE.accessToken}&type=${STATE.filterType}`;
  if (STATE.filterGender) url += `&gender=${STATE.filterGender}`;
  if (STATE.filterAgeMin) url += `&age_min=${STATE.filterAgeMin}`;
  if (STATE.filterAgeMax) url += `&age_max=${STATE.filterAgeMax}`;

  try {
    const res = await api(url); const data = await res.json();
    if (data.success) {
      if (data.users.length === 0) {
        let hint = '当前没有符合条件的人，试试放宽条件';
        if (STATE.filterGender) hint += '（如不限性别）';
        if (STATE.filterAgeMin || STATE.filterAgeMax) hint += '（或扩大年龄范围）';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('.empty-text').textContent = '暂无匹配用户';
        emptyEl.querySelector('.empty-hint').textContent = hint;
        listEl.innerHTML = ''; listEl.appendChild(emptyEl);
      } else {
        emptyEl.style.display = 'none'; listEl.innerHTML = '';
        const rule = MATCH_RULES[STATE.filterType] || {};
        const banner = document.createElement('div');
        banner.className = 'match-info-banner';
        banner.textContent = `💡 ${rule.desc} | 找到 ${data.users.length} 位潜在匹配`;
        listEl.appendChild(banner);
        data.users.forEach((u, i) => listEl.appendChild(createUserCard(u, i)));
      }
    } else { showToast(data.error || '加载失败', 'error'); }
  } catch (err) {
    listEl.innerHTML = ''; emptyEl.style.display = 'block';
    emptyEl.querySelector('.empty-text').textContent = '加载失败';
    emptyEl.querySelector('.empty-hint').textContent = '请检查网络连接后重试';
    listEl.appendChild(emptyEl);
  }
}

function createUserCard(user, index) {
  const card = document.createElement('div');
  card.className = 'user-card';
  card.style.animationDelay = `${index * 0.05}s`;

  const genderEmoji = user.gender === '男' ? '♂' : '♀';
  const extraTags = [];
  if (user.region) extraTags.push(`📍 ${user.region}`);
  if (user.constellation) extraTags.push(`${CONSTELLATION_EMOJI[user.constellation]||'✨'} ${user.constellation}`);
  if (user.mbti) extraTags.push(`🧠 ${user.mbti}`);

  card.innerHTML = `
    <div class="card-header">
      <div class="card-avatar">${genderEmoji}</div>
      <div class="card-info">
        <div class="card-name">${escapeHtml(user.nickname)}</div>
        <div class="card-basic">${user.age}岁 · ${user.gender} · ${user.orientation}</div>
      </div>
    </div>
    ${extraTags.length ? `<div class="card-extra-row">${extraTags.map(t => `<span class="card-extra-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    <div class="card-tags">
      ${user.relationship_types.map(t => `<span class="card-tag tag-type">${escapeHtml(t)}</span>`).join('')}
      ${user.overlap_types ? user.overlap_types.map(t => `<span class="card-tag tag-overlap">💫 ${escapeHtml(t)}</span>`).join('') : ''}
    </div>
    <div class="card-actions">
      ${user.is_matched
        ? `<button class="btn btn-matched btn-sm btn-full">💕 已匹配</button>`
        : user.is_liked
          ? `<button class="btn btn-like liked btn-sm btn-full">❤️ 已喜欢</button>`
          : `<button class="btn btn-like btn-sm btn-full" onclick="showConfirmModal(${user.id}, '${escapeHtml(user.nickname)}', this)">💗 喜欢TA</button>`
      }
    </div>
  `;
  return card;
}

// ========== 🔒 确认建立关系弹窗 ==========
function showConfirmModal(targetUserId, targetNickname, btn) {
  STATE.pendingLike = { targetUserId, targetNickname, btn };
  const relType = STATE.filterType || '配对';
  document.getElementById('confirmText').textContent = `是否确定和「${targetNickname}」建立「${relType}」关系吗？`;
  document.getElementById('confirmModal').style.display = 'flex';
}

function cancelConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
  STATE.pendingLike = { targetUserId: null, targetNickname: null, btn: null };
}

async function doConfirmLike() {
  document.getElementById('confirmModal').style.display = 'none';
  const { targetUserId, targetNickname, btn } = STATE.pendingLike;
  STATE.pendingLike = { targetUserId: null, targetNickname: null, btn: null };

  if (!targetUserId || !btn) return;

  btn.disabled = true; btn.textContent = '发送中...';
  try {
    const res = await api('/api/like', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_user_id: STATE.userId,
        to_user_id: targetUserId,
        token: STATE.accessToken,
        relationship_type: STATE.filterType
      })
    });
    const data = await res.json();
    if (data.success) {
      if (data.matched) {
        // 匹配成功 → 清除本地存储（用户数据已从信息库移除）
        localStorage.removeItem('match_user');
        showMatchModal(data.target_nickname, data.target_wechat_id, data.relationship_type || STATE.filterType);
        btn.className = 'btn btn-matched btn-sm btn-full';
        btn.textContent = '💕 已匹配';
      } else {
        btn.className = 'btn btn-like liked btn-sm btn-full';
        btn.textContent = '❤️ 已喜欢';
        showToast('已发送喜欢，等待对方回应...', 'success');
      }
    } else { showToast(data.error || '操作失败', 'error'); btn.disabled = false; }
  } catch (err) { showToast('网络错误', 'error'); btn.disabled = false; }
}

// ========== 匹配成功弹窗 ==========
function showMatchModal(nickname, wechatId, relType) {
  document.getElementById('matchCardNickname').textContent = nickname;
  document.getElementById('matchCardWechat').textContent = wechatId;
  document.getElementById('matchModal').style.display = 'flex';
  createCelebration();
}
function closeMatchModal() {
  document.getElementById('matchModal').style.display = 'none';
  STATE.userId = null; STATE.accessToken = null;
  STATE.filterType = null; STATE.filterGender = null; STATE.filterAgeMin = null; STATE.filterAgeMax = null;
  STATE.myTypes = []; STATE.isFirstBrowse = true;
  document.getElementById('tabBar').style.display = 'none';
  document.getElementById('page-auth').style.display = 'block';
  ['page-browse','page-matches','page-profile'].forEach(id => document.getElementById(id).style.display = 'none');
}
function copyWechatId() {
  const wid = document.getElementById('matchCardWechat').textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(wid).then(() => showToast('微信号已复制！', 'success')).catch(() => fallbackCopy(wid));
  } else { fallbackCopy(wid); }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast('微信号已复制！', 'success'); } catch (e) { showToast('复制失败', 'error'); }
  document.body.removeChild(ta);
}
function createCelebration() {
  const colors = ['#d4a574','#c9a96e','#e8c97a','#f0d68a','#b8956a','#a08050'];
  for (let i = 0; i < 40; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      const size = 6 + Math.random() * 12;
      p.style.cssText = `position:fixed;left:${20+Math.random()*60}%;bottom:30%;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>.5?'50%':'2px'};pointer-events:none;z-index:1000;animation:particleFly ${1+Math.random()*2}s ease-out forwards;`;
      document.body.appendChild(p);
      setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 3000);
    }, i * 30);
  }
}

// ========== 匹配列表 ==========
async function loadMatchesList() {
  const listEl = document.getElementById('matchesList');
  const emptyEl = document.getElementById('matchesEmpty');
  listEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p class="loading-text">加载匹配列表...</p></div>';
  try {
    const res = await api(`/api/matches/${STATE.userId}?token=${STATE.accessToken}`);
    const data = await res.json();
    if (data.success) {
      if (data.matches.length === 0) { emptyEl.style.display = 'block'; listEl.innerHTML = ''; listEl.appendChild(emptyEl); }
      else { emptyEl.style.display = 'none'; listEl.innerHTML = ''; data.matches.forEach((m, i) => listEl.appendChild(createMatchCard(m, i))); }
    }
  } catch (err) {
    listEl.innerHTML = ''; emptyEl.style.display = 'block';
    emptyEl.querySelector('.empty-text').textContent = '加载失败';
    listEl.appendChild(emptyEl);
  }
}
function createMatchCard(match, index) {
  const card = document.createElement('div');
  card.className = 'match-card';
  card.style.animationDelay = `${index * 0.05}s`;
  const p = match.partner;
  const genderEmoji = p.gender === '男' ? '♂' : '♀';
  const date = new Date(match.matched_at).toLocaleDateString('zh-CN');
  const extraTags = [];
  if (p.region) extraTags.push(`📍 ${p.region}`);
  if (p.constellation) extraTags.push(`${CONSTELLATION_EMOJI[p.constellation]||'✨'} ${p.constellation}`);
  if (p.mbti) extraTags.push(`🧠 ${p.mbti}`);

  card.innerHTML = `
    <div class="card-header">
      <div class="card-avatar">${genderEmoji}</div>
      <div class="card-info">
        <div class="card-name">${escapeHtml(p.nickname)}</div>
        <div class="card-basic">${p.age}岁 · ${p.gender} · ${p.orientation}</div>
      </div>
      <span style="font-size:12px;color:var(--text-muted);">${date}</span>
    </div>
    ${extraTags.length ? `<div class="card-extra-row">${extraTags.map(t => `<span class="card-extra-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    <div class="card-tags">
      ${(p.relationship_types||[]).map(t => `<span class="card-tag tag-type">${escapeHtml(t)}</span>`).join('')}
      <span class="card-tag tag-overlap">💕 已匹配</span>
    </div>
    <div class="wechat-reveal">
      <span class="wechat-reveal-label">微信号</span>
      <span class="wechat-reveal-id">${escapeHtml(p.wechat_id)}</span>
      <button class="btn btn-copy-sm" onclick="copyWechatFromCard(this, '${escapeHtml(p.wechat_id)}')">📋 复制</button>
    </div>
  `;
  return card;
}
function copyWechatFromCard(btn, wid) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(wid).then(() => { btn.textContent='✅ 已复制'; setTimeout(()=>btn.textContent='📋 复制',2000); });
  } else { fallbackCopy(wid); }
}

// ========== 个人资料 ==========
async function loadProfile() {
  const infoEl = document.getElementById('profileInfo');
  const statsEl = document.getElementById('profileStats');
  infoEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
  statsEl.innerHTML = '';
  try {
    const res = await api(`/api/profile/${STATE.userId}?token=${STATE.accessToken}`);
    const data = await res.json();
    if (data.success) {
      const u = data.user;
      const extraInfo = [];
      if (u.region) extraInfo.push(`📍 ${u.region}`);
      if (u.constellation) extraInfo.push(`${CONSTELLATION_EMOJI[u.constellation]||'✨'} ${u.constellation}`);
      if (u.mbti) extraInfo.push(`🧠 ${u.mbti}`);

      infoEl.innerHTML = `
        <p><strong>${escapeHtml(u.nickname)}</strong></p>
        <p>${u.age}岁 · ${u.gender} · ${u.orientation}</p>
        ${extraInfo.length ? `<p>${extraInfo.join(' · ')}</p>` : ''}
        <p>想找：${(u.relationship_types||[]).map(t => `<span class="profile-highlight">${escapeHtml(t)}</span>`).join(' · ')}</p>
        ${data.archived ? '<p style="color:var(--success);font-size:12px;">✅ 已匹配 — 数据已存档</p>' : ''}
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px;">注册时间：${new Date(u.created_at||Date.now()).toLocaleDateString('zh-CN')}</p>
      `;
      statsEl.innerHTML = `
        <div class="stat-card"><div class="stat-number">${data.stats.likes_received}</div><div class="stat-label">收到喜欢</div></div>
        <div class="stat-card"><div class="stat-number">${data.stats.match_count}</div><div class="stat-label">匹配成功</div></div>
      `;
    } else { infoEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;">加载失败</p>'; }
  } catch (err) { infoEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;">加载失败</p>'; }
}

// ========== 退出 ==========
function handleLogout() {
  if (confirm('确定要退出登录吗？')) {
    localStorage.removeItem('match_user');
    STATE.userId = null; STATE.accessToken = null; STATE.nickname = null;
    STATE.filterType = null; STATE.filterGender = null; STATE.filterAgeMin = null; STATE.filterAgeMax = null;
    STATE.myTypes = []; STATE.isFirstBrowse = true;
    document.getElementById('page-auth').style.display = 'block';
    document.getElementById('tabBar').style.display = 'none';
    ['page-browse','page-matches','page-profile'].forEach(id => document.getElementById(id).style.display = 'none');
    showToast('已退出登录');
  }
}

// ========== 工具函数 ==========
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== 🔧 后端连接设置 ==========
document.addEventListener('DOMContentLoaded', () => {
  // 仅在 CloudStudio 托管时显示设置按钮
  if (isCloudStudio) {
    document.getElementById('backendSettings').style.display = 'block';
    // 加载保存的 URL
    const savedUrl = localStorage.getItem('backend_url');
    if (savedUrl) {
      document.getElementById('backendUrlInput').value = savedUrl;
    }
    checkBackendConnection();
  }
});

// 打开/关闭设置面板
document.getElementById('settingsToggle')?.addEventListener('click', () => {
  const panel = document.getElementById('settingsPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  if (panel.style.display === 'block') checkBackendConnection();
});

document.getElementById('settingsClose')?.addEventListener('click', () => {
  document.getElementById('settingsPanel').style.display = 'none';
});

// 更新后端 URL
function updateBackendUrl() {
  const url = document.getElementById('backendUrlInput').value.trim();
  if (!url) return;
  const fullUrl = url.startsWith('http') ? url : 'https://' + url;
  const cleanUrl = fullUrl.replace(/\/+$/, '');
  localStorage.setItem('backend_url', cleanUrl);
  document.getElementById('settingsPanel').style.display = 'none';
  showToast('✅ 后端地址已更新');
  checkBackendConnection();
}

// 检测后端连接状态
async function checkBackendConnection() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const input = document.getElementById('backendUrlInput');
  
  const base = localStorage.getItem('backend_url') || API_BASE;
  if (input && !input.value) input.value = base.replace(/\/+$/, '');
  
  dot.className = 'status-dot';
  text.textContent = '检测中...';
  
  try {
    const res = await fetch(base + '/api/health', { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    if (data.status === 'ok') {
      dot.className = 'status-dot online';
      text.textContent = `已连接 (v${data.version})`;
    } else {
      dot.className = 'status-dot offline';
      text.textContent = '后端异常';
    }
  } catch {
    dot.className = 'status-dot offline';
    text.textContent = '无法连接后端';
  }
}

// 每30秒自动检测连接
if (isCloudStudio) {
  setInterval(checkBackendConnection, 30000);
}
