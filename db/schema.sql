-- Nihongo Sensei Database Schema

-- Notion Sync History & Hash Tracker
CREATE TABLE IF NOT EXISTS notion_sync_state (
    page_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    raw_markdown TEXT NOT NULL,
    last_edited_time TEXT,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Curriculum Units (Daily & 5-Unit Boss Trials)
CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_number INTEGER UNIQUE NOT NULL,
    unit_type TEXT DEFAULT 'DAILY', -- 'DAILY' or 'BOSS_5'
    notion_page_id TEXT,
    content_hash TEXT,
    title TEXT NOT NULL,
    lesson_json TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(notion_page_id) REFERENCES notion_sync_state(page_id)
);

-- SM-2 Mastery & Cross-Unit Spaced Repetition Bank
CREATE TABLE IF NOT EXISTS mastery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER,
    item_type TEXT NOT NULL, -- 'KANA', 'VOCAB', 'GRAMMAR', 'PHRASE'
    japanese TEXT NOT NULL,
    kana_only TEXT,
    romaji TEXT,
    english TEXT,
    marathi TEXT,
    pronunciation_tip TEXT,
    audio_path TEXT,
    svg_markup TEXT,
    ease_factor REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    wrong_count INTEGER DEFAULT 0,
    next_review_date DATE DEFAULT (date('now')),
    FOREIGN KEY(unit_id) REFERENCES units(id)
);

-- Kaggle Human Speech Dataset Index (Tier 1 Audio)
CREATE TABLE IF NOT EXISTS kaggle_audio (
    transcript TEXT PRIMARY KEY,
    file_path TEXT NOT NULL
);

-- SVG Vector Visual Cache (Iconify Fluent Emoji Flat / Twemoji)
CREATE TABLE IF NOT EXISTS svg_cache (
    keyword TEXT PRIMARY KEY,
    svg_markup TEXT NOT NULL
);

-- Users (Local Email/Password & Google Sign-In)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    password_hash TEXT,
    auth_provider TEXT DEFAULT 'local', -- 'local' or 'google'
    role TEXT DEFAULT 'student',        -- 'admin' or 'student'
    xp INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Per-User Unit Progression
CREATE TABLE IF NOT EXISTS user_unit_progress (
    user_id INTEGER NOT NULL,
    unit_number INTEGER NOT NULL,
    is_completed BOOLEAN DEFAULT 0,
    best_accuracy REAL DEFAULT 0,
    completed_at TIMESTAMP,
    PRIMARY KEY (user_id, unit_number),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Per-User Spaced Repetition (SM-2) Mastery Bank
CREATE TABLE IF NOT EXISTS user_mastery (
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    ease_factor REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    wrong_count INTEGER DEFAULT 0,
    next_review_date DATE DEFAULT (date('now')),
    PRIMARY KEY (user_id, item_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(item_id) REFERENCES mastery_items(id) ON DELETE CASCADE
);

-- Live Sensei Practice Sessions & AI Recaps
CREATE TABLE IF NOT EXISTS live_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    unit_focus TEXT,
    duration_seconds INTEGER DEFAULT 0,
    summary_json TEXT,
    transcript_json TEXT,
    whiteboard_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Autonomous Notion Page Revision & Auto-Sync State
CREATE TABLE IF NOT EXISTS notion_page_sync_state (
    page_id TEXT PRIMARY KEY,
    last_edited_time TEXT,
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

