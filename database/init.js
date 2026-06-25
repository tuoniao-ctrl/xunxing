const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'match.db');

function initDatabase() {
  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      age INTEGER NOT NULL CHECK(age >= 1 AND age <= 120),
      gender TEXT NOT NULL CHECK(gender IN ('男', '女')),
      region TEXT NOT NULL DEFAULT '',
      constellation TEXT NOT NULL DEFAULT '',
      mbti TEXT NOT NULL DEFAULT '',
      orientation TEXT NOT NULL CHECK(orientation IN ('男', '女', '双性', '泛性', '无性', '其他')),
      relationship_types TEXT NOT NULL,
      wechat_id TEXT NOT NULL,
      access_token TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(from_user_id, to_user_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      matched_at DATETIME DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user1_id, user2_id)
    );
  `);

  // 匹配成功后用户数据存档（单独信息库）
  db.exec(`
    CREATE TABLE IF NOT EXISTS matched_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      matched_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
    );
  `);

  console.log('✅ 数据库初始化完成');
  return db;
}

module.exports = { initDatabase };
