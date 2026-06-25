-- 寻星数据库 Schema for Supabase PostgreSQL
-- 在 Supabase Dashboard → SQL Editor 中运行此文件

-- ========== 1. 用户表 ==========
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  nickname TEXT NOT NULL,
  age INTEGER NOT NULL CHECK(age >= 1 AND age <= 120),
  gender TEXT NOT NULL CHECK(gender IN ('男', '女')),
  region TEXT NOT NULL DEFAULT '',
  constellation TEXT NOT NULL DEFAULT '',
  mbti TEXT NOT NULL DEFAULT '',
  orientation TEXT NOT NULL CHECK(orientation IN ('男', '女', '双性', '泛性', '无性', '其他')),
  relationship_types TEXT NOT NULL,
  wechat_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 2. 点赞表 ==========
CREATE TABLE IF NOT EXISTS likes (
  id SERIAL PRIMARY KEY,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_user_id, to_user_id)
);

-- ========== 3. 匹配表 ==========
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  user1_id INTEGER NOT NULL,
  user2_id INTEGER NOT NULL,
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user1_id, user2_id)
);

-- ========== 4. 匹配存档表 ==========
CREATE TABLE IF NOT EXISTS matched_users (
  id SERIAL PRIMARY KEY,
  original_user_id INTEGER NOT NULL,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  matched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 索引优化 ==========
CREATE INDEX IF NOT EXISTS idx_users_wechat ON users(wechat_id);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(access_token);
CREATE INDEX IF NOT EXISTS idx_likes_from ON likes(from_user_id);
CREATE INDEX IF NOT EXISTS idx_likes_to ON likes(to_user_id);
CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_matched_users_original ON matched_users(original_user_id);
CREATE INDEX IF NOT EXISTS idx_matched_users_match ON matched_users(match_id);

-- ========== 启用 Row Level Security（可选，增强安全） ==========
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE matched_users ENABLE ROW LEVEL SECURITY;
