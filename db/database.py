import os
import json
import logging
import threading
import time
import re
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from datetime import date, datetime, timedelta

from psycopg.rows import dict_row
from psycopg.pq import TransactionStatus
from psycopg_pool import ConnectionPool

logger = logging.getLogger("database")

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

SMALL_KANA = set("ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ")

def is_valid_kana_item(text: str) -> bool:
    """Strictly validates if text is an individual Hiragana/Katakana character or valid 2-char yōon combination."""
    if not text:
        return False
    t = str(text).strip()
    if len(t) == 1:
        return bool(re.match(r'^[\u3040-\u309f\u30a0-\u30ff]$', t))
    if len(t) == 2:
        return bool(re.match(r'^[\u3040-\u309f\u30a0-\u30ff]', t[0])) and t[1] in SMALL_KANA
    return False

# --- In-Memory Thread-Safe TTL Cache ---
class InMemoryTTLCache:
    """Thread-safe in-memory cache with TTL expiration and pattern/prefix invalidation."""
    def __init__(self, default_ttl: float = 60.0):
        self._default_ttl = default_ttl
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self._lock = threading.RLock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return None
            expiry, val = entry
            if time.time() > expiry:
                del self._cache[key]
                return None
            return val

    def set(self, key: str, val: Any, ttl: Optional[float] = None):
        with self._lock:
            expiry = time.time() + (ttl if ttl is not None else self._default_ttl)
            self._cache[key] = (expiry, val)

    def invalidate(self, key: str):
        with self._lock:
            self._cache.pop(key, None)

    def invalidate_prefix(self, prefix: str):
        with self._lock:
            keys_to_del = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_del:
                del self._cache[k]

    def clear(self):
        with self._lock:
            self._cache.clear()

CACHE = InMemoryTTLCache(default_ttl=60.0)

def invalidate_cache(key: str):
    CACHE.invalidate(key)

def invalidate_cache_prefix(prefix: str):
    CACHE.invalidate_prefix(prefix)

def clear_cache():
    CACHE.clear()

# --- Neon PostgreSQL Connection Pool ---
_pool: Optional[ConnectionPool] = None
_pool_lock = threading.RLock()

def sanitize_database_url(url: str) -> str:
    """Sanitizes DATABASE_URL by stripping any 'psql' CLI command prefix, quotes, and whitespace.
    
    Handles common user copy-paste formats from Neon dashboard:
    - psql 'postgresql://user:pass@ep-xyz-pooler.neon.tech/neondb?sslmode=require'
    - 'postgresql://user:pass@ep-xyz-pooler.neon.tech/neondb?sslmode=require'
    - "postgresql://user:pass@ep-xyz-pooler.neon.tech/neondb?sslmode=require"
    - psql postgresql://...
    """
    if not url:
        return ""
    u = url.strip()
    # Strip wrapping quotes
    if (u.startswith('"') and u.endswith('"')) or (u.startswith("'") and u.endswith("'")):
        u = u[1:-1].strip()

    # Search for standard postgres URI anywhere in the string
    m = re.search(r"postgres(?:ql)?://[^\s'\"]+", u)
    if m:
        u = m.group(0)
    elif u.startswith("psql"):
        u = re.sub(r"^psql\s+(-d\s+|--dbname=\s*)?", "", u).strip()
        u = u.strip("'\"").strip()

    u = u.strip("'\"").strip()

    # Neon connections require sslmode=require
    if ("neon.tech" in u or "pooler" in u) and "sslmode=" not in u:
        sep = "&" if "?" in u else "?"
        u = f"{u}{sep}sslmode=require"

    return u

def get_database_url() -> str:
    raw = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or os.getenv("NEON_DATABASE_URL") or ""
    url = sanitize_database_url(raw)
    if url:
        if raw.strip() != url:
            logger.info("Sanitized DATABASE_URL (cleaned CLI command prefix or quotes).")
        return url
    return "postgresql://localhost:5432/nihongo"

def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                db_url = get_database_url()
                _pool = ConnectionPool(
                    conninfo=db_url,
                    min_size=0,
                    max_size=10,
                    max_idle=240.0,
                    check=ConnectionPool.check_connection,
                    kwargs={
                        "row_factory": dict_row,
                        "autocommit": False,
                        "prepare_threshold": None,
                    },
                    open=True,
                )
    return _pool

def close_pool():
    global _pool
    with _pool_lock:
        if _pool is not None:
            try:
                _pool.close()
            except Exception:
                pass
            _pool = None

class CompatibleCursor:
    """psycopg cursor wrapper providing seamless parameter adaptation and dict-like rows."""
    def __init__(self, raw_cur):
        self._cur = raw_cur

    def execute(self, query: str, params=None):
        if params is not None and "?" in query and "%s" not in query:
            query = query.replace("?", "%s")
        if params is not None:
            p = tuple(params) if isinstance(params, (list, tuple)) else params
            self._cur.execute(query, p)
        else:
            self._cur.execute(query)
        return self

    def executemany(self, query: str, seq_of_params):
        if "?" in query and "%s" not in query:
            query = query.replace("?", "%s")
        self._cur.executemany(query, seq_of_params)
        return self

    def fetchone(self) -> Optional[Dict[str, Any]]:
        return self._cur.fetchone()

    def fetchall(self) -> List[Dict[str, Any]]:
        return self._cur.fetchall()

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount

    @property
    def description(self):
        return self._cur.description

    def __iter__(self):
        return iter(self._cur)

    def close(self):
        try:
            self._cur.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

class PooledConnectionWrapper:
    """Wrapper managing connection checkout and release back to ConnectionPool."""
    def __init__(self, raw_conn, pool):
        self._raw = raw_conn
        self._pool = pool
        self._closed = False

    def cursor(self, **kwargs) -> CompatibleCursor:
        return CompatibleCursor(self._raw.cursor(**kwargs))

    def execute(self, query: str, params=None) -> CompatibleCursor:
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def commit(self):
        self._raw.commit()

    def rollback(self):
        self._raw.rollback()

    def executescript(self, script: str):
        with self._raw.cursor() as cur:
            cur.execute(script)
        self._raw.commit()

    def close(self):
        if not self._closed:
            self._closed = True
            try:
                if self._raw.info.transaction_status != TransactionStatus.IDLE:
                    self._raw.rollback()
                self._pool.putconn(self._raw)
            except Exception:
                pass

    def __del__(self):
        self.close()

    def __enter__(self):
        self._raw.__enter__()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return self._raw.__exit__(exc_type, exc_val, exc_tb)

def get_connection(db_path: Optional[Any] = None) -> PooledConnectionWrapper:
    pool = get_pool()
    raw = pool.getconn()
    return PooledConnectionWrapper(raw, pool)

def migrate_kana_classifications(conn: Optional[Any] = None) -> int:
    """Migrates any multi-character words incorrectly classified as KANA to VOCAB."""
    close_at_end = False
    if conn is None:
        conn = get_connection()
        close_at_end = True
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, japanese FROM mastery_items WHERE item_type = 'KANA'")
        rows = cur.fetchall()
        to_update = []
        for r in rows:
            jp = r["japanese"]
            if not is_valid_kana_item(jp):
                to_update.append(r["id"])
        if to_update:
            for item_id in to_update:
                cur.execute("UPDATE mastery_items SET item_type = 'VOCAB' WHERE id = %s", (item_id,))
            conn.commit()
            print(f"🧹 [MIGRATION] Reclassified {len(to_update)} multi-character items from KANA to VOCAB.")
        return len(to_update)
    finally:
        if close_at_end:
            conn.close()

def init_database(db_path: Optional[Any] = None):
    """Initializes tables using schema.sql and runs essential data migrations."""
    conn = get_connection()
    try:
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            schema_sql = f.read()
        conn.executescript(schema_sql)
        migrate_kana_classifications(conn)
    finally:
        conn.close()

# --- Notion Sync State ---
def save_notion_sync(page_id: str, title: str, content_hash: str, raw_markdown: str, last_edited: Optional[str] = None):
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT INTO notion_sync_state (page_id, title, content_hash, raw_markdown, last_edited_time, synced_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT(page_id) DO UPDATE SET
                title = excluded.title,
                content_hash = excluded.content_hash,
                raw_markdown = excluded.raw_markdown,
                last_edited_time = excluded.last_edited_time,
                synced_at = NOW();
        """, (page_id, title, content_hash, raw_markdown, last_edited))
    conn.close()

def get_notion_sync(page_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM notion_sync_state WHERE page_id = %s", (page_id,))
    row = cur.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def get_all_synced_classes() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT page_id, title, content_hash, last_edited_time, synced_at, LENGTH(raw_markdown) as markdown_length FROM notion_sync_state ORDER BY title ASC")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- Units ---
def save_unit(
    unit_number: int,
    title: str,
    lesson_json: str,
    unit_type: str = "DAILY",
    notion_page_id: Optional[str] = None,
    content_hash: Optional[str] = None,
    is_completed: bool = False,
    conn: Optional[Any] = None
) -> int:
    close_at_end = False
    if conn is None:
        conn = get_connection()
        close_at_end = True
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO units (unit_number, unit_type, notion_page_id, content_hash, title, lesson_json, is_completed, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT(unit_number) DO UPDATE SET
                unit_type = excluded.unit_type,
                notion_page_id = excluded.notion_page_id,
                content_hash = excluded.content_hash,
                title = excluded.title,
                lesson_json = excluded.lesson_json,
                is_completed = (units.is_completed OR excluded.is_completed)
            RETURNING id;
        """, (unit_number, unit_type, notion_page_id, content_hash, title, lesson_json, bool(is_completed)))
        row = cur.fetchone()
        unit_id = (row["id"] if isinstance(row, dict) else row[0]) if row else 0
        if close_at_end:
            conn.commit()
        # Invalidate read cache
        CACHE.invalidate(f"unit:{unit_number}")
        CACHE.invalidate(f"unit:base:{unit_number}")
        CACHE.invalidate_prefix("user_prog:")
        CACHE.invalidate_prefix("roadmap:")
        CACHE.invalidate_prefix("bank:")
        CACHE.invalidate_prefix("due:")
        return unit_id
    finally:
        if close_at_end:
            conn.close()

def get_unit(unit_number: int) -> Optional[Dict[str, Any]]:
    cache_key = f"unit:{unit_number}"
    cached = CACHE.get(cache_key)
    if cached is not None:
        return dict(cached)

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM units WHERE unit_number = %s", (unit_number,))
    row = cur.fetchone()
    conn.close()
    if row:
        d = dict(row)
        try:
            d["lesson_data"] = json.loads(d["lesson_json"])
        except Exception:
            d["lesson_data"] = {}
        CACHE.set(cache_key, d)
        return d
    return None

def get_unit_by_notion_page_id(page_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM units WHERE notion_page_id = %s", (page_id,))
    row = cur.fetchone()
    conn.close()
    if row:
        d = dict(row)
        try:
            d["lesson_data"] = json.loads(d["lesson_json"])
        except Exception:
            d["lesson_data"] = {}
        return d
    return None

def upsert_mastery_item(
    unit_id: int,
    item_type: str,
    japanese: str,
    kana_only: Optional[str] = None,
    romaji: Optional[str] = None,
    english: Optional[str] = None,
    marathi: Optional[str] = None,
    pronunciation_tip: Optional[str] = None,
    audio_path: Optional[str] = None,
    svg_markup: Optional[str] = None,
    ease_factor: float = 2.5,
    interval_days: int = 1,
    repetitions: int = 0,
    wrong_count: int = 0,
    next_review_date: Optional[str] = None,
    conn: Optional[Any] = None
) -> int:
    if item_type == "KANA" and not is_valid_kana_item(japanese):
        item_type = "VOCAB"
    close_at_end = False
    if conn is None:
        conn = get_connection()
        close_at_end = True
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM mastery_items WHERE unit_id = %s AND japanese = %s", (unit_id, japanese))
        row = cur.fetchone()
        if row:
            item_id = row["id"]
            cur.execute("""
                UPDATE mastery_items SET
                    item_type = %s,
                    kana_only = COALESCE(%s, kana_only),
                    romaji = COALESCE(%s, romaji),
                    english = COALESCE(%s, english),
                    marathi = COALESCE(%s, marathi),
                    pronunciation_tip = COALESCE(%s, pronunciation_tip),
                    audio_path = COALESCE(%s, audio_path),
                    svg_markup = COALESCE(%s, svg_markup)
                WHERE id = %s
            """, (item_type, kana_only, romaji, english, marathi, pronunciation_tip, audio_path, svg_markup, item_id))
            if close_at_end:
                conn.commit()
            CACHE.invalidate_prefix("bank:")
            CACHE.invalidate_prefix("due:")
            return item_id
        else:
            item_id = save_mastery_item(
                unit_id=unit_id,
                item_type=item_type,
                japanese=japanese,
                kana_only=kana_only,
                romaji=romaji,
                english=english,
                marathi=marathi,
                pronunciation_tip=pronunciation_tip,
                audio_path=audio_path,
                svg_markup=svg_markup,
                ease_factor=ease_factor,
                interval_days=interval_days,
                repetitions=repetitions,
                wrong_count=wrong_count,
                next_review_date=next_review_date,
                conn=conn
            )
            if close_at_end:
                conn.commit()
            CACHE.invalidate_prefix("bank:")
            CACHE.invalidate_prefix("due:")
            return item_id
    finally:
        if close_at_end:
            conn.close()

def batch_upsert_mastery_items(
    unit_id: int,
    cards: List[Dict[str, Any]],
    conn: Optional[Any] = None
) -> int:
    """Batch upserts study cards for a unit within a single connection/transaction."""
    if not cards:
        return 0
    if not unit_id or int(unit_id) <= 0:
        raise ValueError(f"Invalid unit_id: {unit_id}. Cannot batch upsert mastery items without a valid unit.")
    unit_id = int(unit_id)

    close_at_end = False
    if conn is None:
        conn = get_connection()
        close_at_end = True

    try:
        cur = conn.cursor()
        cur.execute("SELECT id, japanese FROM mastery_items WHERE unit_id = %s", (unit_id,))
        existing_map = {}
        for r in cur.fetchall():
            existing_map[r["japanese"]] = r["id"]

        today_str = date.today().isoformat()
        count = 0
        for card in cards:
            japanese = card.get("japanese")
            if not japanese:
                continue

            item_type = card.get("item_type", "VOCAB")
            if item_type == "KANA" and not is_valid_kana_item(japanese):
                item_type = "VOCAB"
            kana_only = card.get("kana_only")
            romaji = card.get("romaji")
            english = card.get("english")
            marathi = card.get("marathi")
            pronunciation_tip = card.get("pronunciation_tip")
            audio_path = card.get("audio_path")
            svg_markup = card.get("svg_markup")

            if japanese in existing_map:
                item_id = existing_map[japanese]
                cur.execute("""
                    UPDATE mastery_items SET
                        item_type = %s,
                        kana_only = COALESCE(%s, kana_only),
                        romaji = COALESCE(%s, romaji),
                        english = COALESCE(%s, english),
                        marathi = COALESCE(%s, marathi),
                        pronunciation_tip = COALESCE(%s, pronunciation_tip),
                        audio_path = COALESCE(%s, audio_path),
                        svg_markup = COALESCE(%s, svg_markup)
                    WHERE id = %s
                """, (item_type, kana_only, romaji, english, marathi, pronunciation_tip, audio_path, svg_markup, item_id))
            else:
                cur.execute("""
                    INSERT INTO mastery_items (
                        unit_id, item_type, japanese, kana_only, romaji, english, marathi,
                        pronunciation_tip, audio_path, svg_markup, ease_factor, interval_days,
                        repetitions, wrong_count, next_review_date
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 2.5, 1, 0, 0, %s)
                    RETURNING id;
                """, (
                    unit_id, item_type, japanese, kana_only, romaji, english, marathi,
                    pronunciation_tip, audio_path, svg_markup, today_str
                ))
                res = cur.fetchone()
                new_id = res["id"] if res else None
                if new_id:
                    existing_map[japanese] = new_id
            count += 1

        if close_at_end:
            conn.commit()
        CACHE.invalidate_prefix("unit:base:")
        CACHE.invalidate_prefix("bank:")
        CACHE.invalidate_prefix("due:")
        return count
    finally:
        if close_at_end:
            conn.close()

def get_all_units() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, unit_number, unit_type, notion_page_id, content_hash, title, is_completed, created_at FROM units ORDER BY unit_number ASC")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def mark_unit_completed(unit_number: int, is_completed: bool = True):
    conn = get_connection()
    with conn:
        conn.execute("UPDATE units SET is_completed = %s WHERE unit_number = %s", (bool(is_completed), unit_number))
    conn.close()
    CACHE.invalidate(f"unit:{unit_number}")
    CACHE.invalidate_prefix("roadmap:")

# --- Mastery Items (SM-2 Bank) ---
def save_mastery_item(
    unit_id: int,
    item_type: str,
    japanese: str,
    kana_only: Optional[str] = None,
    romaji: Optional[str] = None,
    english: Optional[str] = None,
    marathi: Optional[str] = None,
    pronunciation_tip: Optional[str] = None,
    audio_path: Optional[str] = None,
    svg_markup: Optional[str] = None,
    ease_factor: float = 2.5,
    interval_days: int = 1,
    repetitions: int = 0,
    wrong_count: int = 0,
    next_review_date: Optional[str] = None,
    conn: Optional[Any] = None
) -> int:
    close_at_end = False
    if conn is None:
        conn = get_connection()
        close_at_end = True
    rev_date = next_review_date or date.today().isoformat()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO mastery_items (
                unit_id, item_type, japanese, kana_only, romaji, english, marathi,
                pronunciation_tip, audio_path, svg_markup, ease_factor, interval_days,
                repetitions, wrong_count, next_review_date
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """, (
            unit_id, item_type, japanese, kana_only, romaji, english, marathi,
            pronunciation_tip, audio_path, svg_markup, ease_factor, interval_days,
            repetitions, wrong_count, rev_date
        ))
        row = cur.fetchone()
        item_id = row["id"] if row else None
        if close_at_end:
            conn.commit()
        CACHE.invalidate_prefix("bank:")
        CACHE.invalidate_prefix("due:")
        return item_id
    finally:
        if close_at_end:
            conn.close()

def get_due_mastery_items(limit: int = 6) -> List[Dict[str, Any]]:
    """Fetches up to `limit` items that are due for review or have previous mistakes."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM mastery_items
        WHERE next_review_date <= CURRENT_DATE OR wrong_count > 0
        ORDER BY wrong_count DESC, next_review_date ASC
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_mastery_srs(
    item_id: int,
    ease_factor: float,
    interval_days: int,
    repetitions: int,
    wrong_count: int,
    next_review_date: str
):
    conn = get_connection()
    with conn:
        conn.execute("""
            UPDATE mastery_items
            SET ease_factor = %s, interval_days = %s, repetitions = %s, wrong_count = %s, next_review_date = %s
            WHERE id = %s
        """, (ease_factor, interval_days, repetitions, wrong_count, next_review_date, item_id))
    conn.close()

def get_mastery_items_for_unit(unit_id: int) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM mastery_items WHERE unit_id = %s", (unit_id,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- Kaggle Audio Cache ---
def get_kaggle_audio(transcript: str) -> Optional[str]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT file_path FROM kaggle_audio WHERE transcript = %s", (transcript.strip(),))
    row = cur.fetchone()
    conn.close()
    if row:
        return row["file_path"] if isinstance(row, dict) else row[0]
    return None

def save_kaggle_audio(transcript: str, file_path: str):
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT INTO kaggle_audio (transcript, file_path) VALUES (%s, %s)
            ON CONFLICT(transcript) DO UPDATE SET file_path = excluded.file_path
        """, (transcript.strip(), file_path))
    conn.close()

# --- SVG Cache ---
def get_cached_svg(keyword: str) -> Optional[str]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT svg_markup FROM svg_cache WHERE keyword = %s", (keyword.strip().lower(),))
    row = cur.fetchone()
    conn.close()
    if row:
        return row["svg_markup"] if isinstance(row, dict) else row[0]
    return None

def save_cached_svg(keyword: str, svg_markup: str):
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT INTO svg_cache (keyword, svg_markup) VALUES (%s, %s)
            ON CONFLICT(keyword) DO UPDATE SET svg_markup = excluded.svg_markup
        """, (keyword.strip().lower(), svg_markup))
    conn.close()

# --- User & Auth ---
def get_users_count() -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as count FROM users")
    row = cur.fetchone()
    count = row["count"] if row else 0
    conn.close()
    return count

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    if not email:
        return None
    clean_email = email.strip().lower()
    cache_key = f"user:email:{clean_email}"
    cached = CACHE.get(cache_key)
    if cached is not None:
        return dict(cached)

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(%s)", (clean_email,))
    row = cur.fetchone()
    conn.close()
    if row:
        res = dict(row)
        CACHE.set(cache_key, res)
        return res
    return None

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    cache_key = f"user:id:{user_id}"
    cached = CACHE.get(cache_key)
    if cached is not None:
        return dict(cached)

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    conn.close()
    if row:
        res = dict(row)
        CACHE.set(cache_key, res)
        return res
    return None

def create_user(
    email: str,
    name: str,
    password_hash: Optional[str] = None,
    auth_provider: str = 'local',
    role: str = 'student',
    avatar_url: Optional[str] = None
) -> Dict[str, Any]:
    conn = get_connection()
    with conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO users (email, name, password_hash, auth_provider, role, avatar_url, xp, streak)
            VALUES (%s, %s, %s, %s, %s, %s, 0, 0)
            RETURNING id;
        """, (email.strip().lower(), name.strip(), password_hash, auth_provider, role, avatar_url))
        row = cur.fetchone()
        user_id = row["id"] if row else None
    conn.close()
    CACHE.invalidate_prefix("user:")
    return get_user_by_id(user_id)

def upsert_google_user(email: str, name: str, avatar_url: Optional[str] = None, default_role: str = 'student') -> Dict[str, Any]:
    existing = get_user_by_email(email)
    if existing:
        conn = get_connection()
        with conn:
            conn.execute("""
                UPDATE users SET name = COALESCE(%s, name), avatar_url = COALESCE(%s, avatar_url),
                                 role = CASE WHEN %s = 'admin' THEN 'admin' ELSE role END
                WHERE id = %s
            """, (name, avatar_url, default_role, existing["id"]))
        conn.close()
        CACHE.invalidate_prefix("user:")
        return get_user_by_id(existing["id"])
    return create_user(
        email=email,
        name=name,
        password_hash=None,
        auth_provider='google',
        role=default_role,
        avatar_url=avatar_url
    )

def update_user_stats(user_id: int, xp_delta: int = 0, streak: Optional[int] = None):
    conn = get_connection()
    with conn:
        if streak is not None:
            conn.execute("UPDATE users SET xp = GREATEST(0, xp + %s), streak = GREATEST(%s, 1) WHERE id = %s", (xp_delta, streak, user_id))
        else:
            conn.execute("UPDATE users SET xp = GREATEST(0, xp + %s), streak = GREATEST(COALESCE(streak, 0), 1) WHERE id = %s", (xp_delta, user_id))
    conn.close()
    CACHE.invalidate(f"user:id:{user_id}")

# --- Per-User Unit Progression ---
def get_user_roadmap(user_id: int) -> List[Dict[str, Any]]:
    cache_key = f"roadmap:{user_id}"
    cached = CACHE.get(cache_key)
    if cached is not None:
        return list(cached)

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.unit_number, u.unit_type, u.title, u.created_at,
               COALESCE(p.is_completed, FALSE) as is_completed,
               COALESCE(p.best_accuracy, 0) as best_accuracy
        FROM units u
        LEFT JOIN user_unit_progress p ON u.unit_number = p.unit_number AND p.user_id = %s
        ORDER BY u.unit_number ASC
    """, (user_id,))
    rows = cur.fetchall()
    conn.close()
    res = [dict(r) for r in rows]
    CACHE.set(cache_key, res)
    return res

def mark_user_unit_completed(user_id: int, unit_number: int, is_completed: bool = True, accuracy: float = 1.0):
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT INTO user_unit_progress (user_id, unit_number, is_completed, best_accuracy, completed_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT(user_id, unit_number) DO UPDATE SET
                is_completed = (user_unit_progress.is_completed OR excluded.is_completed),
                best_accuracy = GREATEST(user_unit_progress.best_accuracy, excluded.best_accuracy),
                completed_at = NOW()
        """, (user_id, unit_number, bool(is_completed), float(accuracy)))
    conn.close()
    CACHE.invalidate(f"roadmap:{user_id}")

# --- Per-User SM-2 Mastery ---
def get_user_mastery_item(user_id: int, item_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM user_mastery WHERE user_id = %s AND item_id = %s", (user_id, item_id))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

def save_user_mastery(
    user_id: int,
    item_id: int,
    ease_factor: float = 2.5,
    interval_days: int = 1,
    repetitions: int = 0,
    wrong_count: int = 0,
    next_review_date: Optional[str] = None
):
    interval_days = max(1, min(int(interval_days), 365))
    rev_date = next_review_date or date.today().isoformat()
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT INTO user_mastery (
                user_id, item_id, ease_factor, interval_days, repetitions, wrong_count, next_review_date
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT(user_id, item_id) DO UPDATE SET
                ease_factor = excluded.ease_factor,
                interval_days = excluded.interval_days,
                repetitions = excluded.repetitions,
                wrong_count = excluded.wrong_count,
                next_review_date = excluded.next_review_date
        """, (user_id, item_id, ease_factor, interval_days, repetitions, wrong_count, rev_date))
    conn.close()
    CACHE.invalidate(f"bank:{user_id}")
    CACHE.invalidate_prefix(f"due:{user_id}")

def compute_sm2_update(quality: int, current_ef: float = 2.5, current_iv: int = 1, current_rep: int = 0) -> Tuple[float, int, int]:
    q = max(0, min(5, int(quality)))
    if q < 3:
        new_reps = 0
        new_iv = 1
    else:
        if current_rep == 0:
            new_iv = 1
        elif current_rep == 1:
            new_iv = 6
        else:
            new_iv = max(1, min(round(current_iv * current_ef), 365))
        new_reps = current_rep + 1

    new_iv = max(1, min(int(new_iv), 365))
    new_ef = current_ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    new_ef = max(1.3, round(new_ef, 3))
    return new_ef, new_iv, new_reps

def batch_submit_progress(
    user_id: int,
    unit_number: int,
    grades: List[Dict[str, Any]],
    is_completed: bool = False,
    accuracy: float = 1.0,
    earned_xp: int = 50,
) -> Dict[str, Any]:
    """
    Submits user drill or unit progress in a single database transaction with minimal round-trips:
    - Resolves all submitted item IDs in a single query.
    - Fetches all current mastery states in a single query.
    - Computes updated SM-2 parameters in Python memory.
    - Writes all user_mastery updates using a single multi-row INSERT ... ON CONFLICT statement (1 round-trip).
    - Upserts unit completion and updates user stats/streak in the same transaction.
    - Commits once at the end.
    - Only checks boss milestone if is_completed and unit_number % 5 == 0.
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        # 1. Resolve submitted items in batch
        raw_ids: set[int] = set()
        text_targets: set[str] = set()
        for g in grades:
            raw_id = g.get("item_id")
            if raw_id is not None:
                try:
                    raw_ids.add(int(raw_id))
                except (ValueError, TypeError):
                    pass
            else:
                target_text = g.get("target") or g.get("japanese") or g.get("text")
                if target_text:
                    clean_text = str(target_text).strip().rstrip("。！？.!?")
                    if clean_text:
                        text_targets.add(clean_text)

        id_to_real_id: Dict[int, int] = {}
        text_to_real_id: Dict[str, int] = {}

        if raw_ids:
            ph = ", ".join(["%s"] * len(raw_ids))
            cur.execute(f"SELECT id FROM mastery_items WHERE id IN ({ph})", tuple(raw_ids))
            for row in cur.fetchall():
                id_to_real_id[row["id"]] = row["id"]

        if text_targets:
            ph = ", ".join(["%s"] * len(text_targets))
            cur.execute(
                f"SELECT id, japanese, kana_only FROM mastery_items WHERE japanese IN ({ph}) OR kana_only IN ({ph})",
                tuple(text_targets) + tuple(text_targets),
            )
            for row in cur.fetchall():
                if row["japanese"]:
                    text_to_real_id[row["japanese"].strip().rstrip("。！？.!?")] = row["id"]
                if row["kana_only"]:
                    text_to_real_id[row["kana_only"].strip().rstrip("。！？.!?")] = row["id"]

        # Map each grade to its resolved item_id
        resolved_grades: List[Tuple[int, int]] = [] # (item_id, quality)
        for g in grades:
            raw_id = g.get("item_id")
            q = int(g.get("quality", 4))
            real_id = None
            if raw_id is not None:
                try:
                    real_id = id_to_real_id.get(int(raw_id))
                except (ValueError, TypeError):
                    pass
            if not real_id:
                target_text = g.get("target") or g.get("japanese") or g.get("text")
                if target_text:
                    clean_text = str(target_text).strip().rstrip("。！？.!?")
                    real_id = text_to_real_id.get(clean_text)
            if real_id:
                resolved_grades.append((real_id, q))

        resolved_ids = list({item_id for item_id, _ in resolved_grades})

        # 2. Batch fetch existing user_mastery
        curr_mastery: Dict[int, Dict[str, Any]] = {}
        if resolved_ids:
            ph = ", ".join(["%s"] * len(resolved_ids))
            cur.execute(
                f"SELECT item_id, ease_factor, interval_days, repetitions, wrong_count FROM user_mastery WHERE user_id = %s AND item_id IN ({ph})",
                (user_id, *resolved_ids),
            )
            for row in cur.fetchall():
                curr_mastery[row["item_id"]] = dict(row)

        # 3. Compute updated SM-2 states in memory
        mastery_rows: Dict[int, Tuple] = {} # item_id -> (user_id, item_id, ef, iv, rep, wc, next_date)
        updated_items: List[Dict[str, Any]] = []

        for item_id, q in resolved_grades:
            if item_id in mastery_rows:
                _, _, ef, iv, rep, wc, _ = mastery_rows[item_id]
            else:
                curr = curr_mastery.get(item_id)
                ef = float(curr["ease_factor"]) if curr and curr["ease_factor"] is not None else 2.5
                iv = int(curr["interval_days"]) if curr and curr["interval_days"] is not None else 1
                rep = int(curr["repetitions"]) if curr and curr["repetitions"] is not None else 0
                wc = int(curr["wrong_count"]) if curr and curr["wrong_count"] is not None else 0

            new_ef, new_iv, new_rep = compute_sm2_update(q, ef, iv, rep)
            new_wc = wc + 1 if q < 3 else wc
            next_date = (date.today() + timedelta(days=new_iv)).isoformat()

            mastery_rows[item_id] = (user_id, item_id, new_ef, new_iv, new_rep, new_wc, next_date)
            updated_items.append({"item_id": item_id, "quality": q, "repetitions": new_rep})

        # 4. Multi-Row INSERT INTO user_mastery (Single network round-trip for all items)
        if mastery_rows:
            rows_to_insert = list(mastery_rows.values())
            values_clause = ", ".join(["(%s, %s, %s, %s, %s, %s, %s)"] * len(rows_to_insert))
            flattened_params = [val for row in rows_to_insert for val in row]
            cur.execute(f"""
                INSERT INTO user_mastery (
                    user_id, item_id, ease_factor, interval_days, repetitions, wrong_count, next_review_date
                ) VALUES {values_clause}
                ON CONFLICT(user_id, item_id) DO UPDATE SET
                    ease_factor = excluded.ease_factor,
                    interval_days = excluded.interval_days,
                    repetitions = excluded.repetitions,
                    wrong_count = excluded.wrong_count,
                    next_review_date = excluded.next_review_date
            """, flattened_params)

        # 5. Unit progress upsert if unit is completed
        if is_completed:
            cur.execute("""
                INSERT INTO user_unit_progress (user_id, unit_number, is_completed, best_accuracy, completed_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT(user_id, unit_number) DO UPDATE SET
                    is_completed = (user_unit_progress.is_completed OR excluded.is_completed),
                    best_accuracy = GREATEST(user_unit_progress.best_accuracy, excluded.best_accuracy),
                    completed_at = NOW()
            """, (user_id, int(unit_number), True, float(accuracy)))

        # 6. Update user XP and streak in the same query via RETURNING
        cur.execute("""
            UPDATE users
            SET xp = GREATEST(0, xp + %s),
                streak = CASE WHEN %s = 1 THEN GREATEST(COALESCE(streak, 0) + 1, 1) ELSE GREATEST(COALESCE(streak, 0), 1) END
            WHERE id = %s
            RETURNING xp, streak
        """, (earned_xp, 1 if is_completed else 0, user_id))
        user_row = cur.fetchone()

        new_xp = user_row["xp"] if user_row else 0
        curr_streak = user_row["streak"] if user_row else 1

        # Single transaction commit
        conn.commit()

    finally:
        conn.close()

    # Invalidate in-memory caches
    CACHE.invalidate(f"bank:{user_id}")
    CACHE.invalidate_prefix(f"due:{user_id}")
    CACHE.invalidate(f"roadmap:{user_id}")
    CACHE.invalidate(f"user:id:{user_id}")
    CACHE.invalidate_prefix(f"user:{user_id}")
    CACHE.invalidate_prefix(f"user_prog:{user_id}")

    # 7. Zero-overhead Boss milestone check: only runs when unit is completed AND is a multiple of 5
    boss_unit_unlocked = False
    if is_completed and int(unit_number) > 0 and int(unit_number) % 5 == 0:
        try:
            from agents.memory_boss_agent import MemoryBossAgent
            boss_agent = MemoryBossAgent()
            boss_unit = boss_agent.maybe_generate_boss_unit()
            boss_unit_unlocked = boss_unit is not None
        except Exception as e:
            logger.warning("Failed boss unit check for unit %s: %s", unit_number, e)

    return {
        "status": "ok",
        "earned_xp": earned_xp,
        "total_xp": new_xp,
        "streak": curr_streak,
        "unit_completed": int(unit_number) if is_completed else None,
        "user_xp": new_xp,
        "user_streak": curr_streak,
        "unit_number": int(unit_number),
        "is_completed": is_completed,
        "updated_mastery_items": len(updated_items),
        "boss_unit_unlocked": boss_unit_unlocked,
    }

def get_user_due_mastery_items(user_id: int, limit: int = 30) -> List[Dict[str, Any]]:
    cache_key = f"due:{user_id}:{limit}"
    cached = CACHE.get(cache_key)
    if cached is not None:
        return list(cached)

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT m.*, u.unit_number, u.title as unit_title,
               COALESCE(um.ease_factor, 2.5) as ease_factor,
               COALESCE(um.interval_days, 1) as interval_days,
               COALESCE(um.repetitions, 0) as repetitions,
               COALESCE(um.wrong_count, 0) as wrong_count,
               COALESCE(um.next_review_date, CURRENT_DATE) as next_review_date
        FROM mastery_items m
        JOIN units u ON m.unit_id = u.id
        LEFT JOIN user_mastery um ON m.id = um.item_id AND um.user_id = %s
        WHERE (um.next_review_date <= CURRENT_DATE OR um.wrong_count > 0 OR um.user_id IS NULL)
        ORDER BY COALESCE(um.wrong_count, 0) DESC, COALESCE(um.next_review_date, CURRENT_DATE) ASC
        LIMIT %s
    """, (user_id, limit))
    rows = cur.fetchall()
    conn.close()
    res = [dict(r) for r in rows]
    CACHE.set(cache_key, res)
    return res

def get_user_bank_items(user_id: int) -> List[Dict[str, Any]]:
    cache_key = f"bank:{user_id}"
    cached = CACHE.get(cache_key)
    if cached is not None:
        return list(cached)

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT m.*, u.unit_number, u.title as unit_title,
               COALESCE(um.repetitions, 0) as repetitions,
               COALESCE(um.wrong_count, 0) as wrong_count,
               COALESCE(um.ease_factor, 2.5) as ease_factor,
               COALESCE(um.interval_days, 1) as interval_days,
               COALESCE(um.next_review_date, CURRENT_DATE) as next_review_date
        FROM mastery_items m
        JOIN units u ON m.unit_id = u.id
        LEFT JOIN user_mastery um ON m.id = um.item_id AND um.user_id = %s
        ORDER BY u.unit_number ASC, m.id ASC
    """, (user_id,))
    rows = cur.fetchall()
    conn.close()
    res = [dict(r) for r in rows]
    CACHE.set(cache_key, res)
    return res

# --- Live Sensei Practice Sessions & AI Recaps ---
def save_live_session(
    user_id: int,
    unit_focus: str,
    duration_seconds: int = 0,
    summary_json: Optional[str] = None,
    transcript_json: str = "[]",
    whiteboard_json: str = "[]"
) -> int:
    conn = get_connection()
    with conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO live_sessions (
                user_id, unit_focus, duration_seconds, summary_json, transcript_json, whiteboard_json, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, NOW())
            RETURNING id;
        """, (user_id, unit_focus, duration_seconds, summary_json, transcript_json, whiteboard_json))
        row = cur.fetchone()
        session_id = row["id"] if row else None
    conn.close()
    return session_id

def update_live_session_summary(session_id: int, summary_json: str) -> bool:
    conn = get_connection()
    with conn:
        cur = conn.cursor()
        cur.execute("UPDATE live_sessions SET summary_json = %s WHERE id = %s", (summary_json, session_id))
        updated = cur.rowcount > 0
    conn.close()
    return updated

def get_user_live_sessions(user_id: int, limit: int = 20) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, user_id, unit_focus, duration_seconds, summary_json, transcript_json, whiteboard_json, created_at
        FROM live_sessions
        WHERE user_id = %s
        ORDER BY created_at DESC, id DESC
        LIMIT %s
    """, (user_id, limit))
    rows = cur.fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        try:
            d["summary"] = json.loads(d["summary_json"]) if d["summary_json"] else None
        except Exception:
            d["summary"] = None
        try:
            d["transcript"] = json.loads(d["transcript_json"]) if d["transcript_json"] else []
        except Exception:
            d["transcript"] = []
        try:
            d["whiteboard_cards"] = json.loads(d["whiteboard_json"]) if d["whiteboard_json"] else []
        except Exception:
            d["whiteboard_cards"] = []
        results.append(d)
    return results

def get_user_recent_live_session_summaries(user_id: int, limit: int = 3) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, unit_focus, duration_seconds, summary_json, created_at
        FROM live_sessions
        WHERE user_id = %s AND summary_json IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT %s
    """, (user_id, limit))
    rows = cur.fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        try:
            d["summary"] = json.loads(d["summary_json"]) if d["summary_json"] else None
        except Exception:
            d["summary"] = None
        if d["summary"]:
            results.append(d)
    return results

# --- Autonomous Notion Auto-Sync State Tracking ---
def get_notion_page_sync_state(page_id: str) -> Optional[Dict[str, Any]]:
    """Returns the sync state and last_edited_time for a specific Notion page."""
    clean_id = page_id.replace("-", "")
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT page_id, last_edited_time, last_synced_at FROM notion_page_sync_state WHERE page_id = %s", (clean_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

def get_all_notion_page_sync_states() -> Dict[str, str]:
    """Returns a dictionary mapping page_id -> last_edited_time for all tracked Notion pages."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT page_id, last_edited_time FROM notion_page_sync_state")
    rows = cur.fetchall()
    conn.close()
    return {r["page_id"]: r["last_edited_time"] for r in rows}

def upsert_notion_page_sync_state(page_id: str, last_edited_time: str):
    """Upserts the revision and sync timestamp for a Notion page."""
    clean_id = page_id.replace("-", "")
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT INTO notion_page_sync_state (page_id, last_edited_time, last_synced_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT(page_id) DO UPDATE SET
                last_edited_time = excluded.last_edited_time,
                last_synced_at = NOW()
        """, (clean_id, last_edited_time))
    conn.close()

def is_turso_configured() -> bool:
    """Legacy helper: Turso has been migrated to Neon PostgreSQL."""
    return False

if __name__ == "__main__":
    init_database()
    print("✅ Neon PostgreSQL database initialized with updated schema.")
