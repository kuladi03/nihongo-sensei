-- Nihongo Sensei Database Schema (PostgreSQL)

-- Notion Sync History & Hash Tracker
CREATE TABLE IF NOT EXISTS notion_sync_state (
    page_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    raw_markdown TEXT NOT NULL,
    last_edited_time TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Curriculum Units (Daily & 5-Unit Boss Trials)
CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    unit_number INTEGER UNIQUE NOT NULL,
    unit_type TEXT DEFAULT 'DAILY', -- 'DAILY' or 'BOSS_5'
    notion_page_id TEXT, -- Nullable, no strict FK to allow synthesized Boss Units
    content_hash TEXT,
    title TEXT NOT NULL,
    lesson_json TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SM-2 Mastery & Cross-Unit Spaced Repetition Bank
CREATE TABLE IF NOT EXISTS mastery_items (
    id SERIAL PRIMARY KEY,
    unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE,
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
    next_review_date DATE DEFAULT CURRENT_DATE
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
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    password_hash TEXT,
    auth_provider TEXT DEFAULT 'local', -- 'local' or 'google'
    role TEXT DEFAULT 'student',        -- 'admin' or 'student'
    xp INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-User Unit Progression
CREATE TABLE IF NOT EXISTS user_unit_progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_number INTEGER NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    best_accuracy REAL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, unit_number)
);

-- Per-User Spaced Repetition (SM-2) Mastery Bank
CREATE TABLE IF NOT EXISTS user_mastery (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES mastery_items(id) ON DELETE CASCADE,
    ease_factor REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    wrong_count INTEGER DEFAULT 0,
    next_review_date DATE DEFAULT CURRENT_DATE,
    PRIMARY KEY (user_id, item_id)
);

-- Live Sensei Practice Sessions & AI Recaps
CREATE TABLE IF NOT EXISTS live_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_focus TEXT,
    duration_seconds INTEGER DEFAULT 0,
    summary_json TEXT,
    transcript_json TEXT,
    whiteboard_json TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Autonomous Notion Page Revision & Auto-Sync State
CREATE TABLE IF NOT EXISTS notion_page_sync_state (
    page_id TEXT PRIMARY KEY,
    last_edited_time TEXT,
    last_synced_at TIMESTAMPTZ DEFAULT NOW()
);
