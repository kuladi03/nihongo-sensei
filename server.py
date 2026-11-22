#!/usr/bin/env python3
"""
Nihongo Sensei Unified Single-Port Server (FastAPI + Uvicorn)
Mounts REST endpoints, Live Sensei WebSockets (/api/live/session),
lazy on-demand Edge-TTS audio (/static/audio/{filename}), and serves the SPA frontend.
"""
import os
import sys
import json
import re
import hashlib
import threading
import time
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, date, timedelta
import logging

# Ensure parent directory is in sys.path
sys.path.append(str(Path(__file__).resolve().parent))

import pykakasi
import edge_tts
import uvicorn
from fastapi import FastAPI, Request, HTTPException, WebSocket, status
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from agents.notion_agent import NotionSyncAgent, ensure_env_loaded
from agents.memory_boss_agent import MemoryBossAgent
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    verify_google_token,
    get_current_user_from_header,
    require_admin_role,
)
from db.database import (
    init_database,
    get_notion_sync,
    get_all_synced_classes,
    get_all_units,
    get_unit,
    mark_unit_completed,
    get_mastery_items_for_unit,
    get_connection,
    get_users_count,
    get_user_by_email,
    get_user_by_id,
    create_user,
    upsert_google_user,
    update_user_stats,
    get_user_roadmap,
    mark_user_unit_completed,
    get_user_mastery_item,
    save_user_mastery,
    get_user_due_mastery_items,
    get_user_bank_items,
    get_user_live_sessions,
    get_notion_page_sync_state,
    get_all_notion_page_sync_states,
    upsert_notion_page_sync_state,
    is_turso_configured,
)
from live_sensei import handle_live_session

logger = logging.getLogger("NihongoSenseiServer")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

ensure_env_loaded()
init_database()

PORT = int(os.environ.get("PORT", 8000))

# Cloud Deploy Safeguard: ensure static/audio directory exists on startup
STATIC_AUDIO_DIR = Path(__file__).resolve().parent / "static" / "audio"
os.makedirs(STATIC_AUDIO_DIR, exist_ok=True)

FRONTEND_DIST = Path(__file__).resolve().parent / "frontend" / "dist"

# Autonomous Notion Auto-Sync State & Non-Blocking Lock
SYNC_LOCK = threading.Lock()
NOTION_SYNC_INTERVAL_MINUTES = int(os.environ.get("NOTION_SYNC_INTERVAL_MINUTES", "15"))

SYNC_STATUS = {
    "auto_sync_enabled": True,
    "is_syncing": False,
    "interval_minutes": NOTION_SYNC_INTERVAL_MINUTES,
    "last_checked_at": None,
    "last_synced_at": None,
    "last_error": None,
}

def perform_notion_sync_and_build(hub_page_id: str, token: str) -> dict:
    """Executes full Notion fetch -> SQLite update -> unit rebuild pipeline under SYNC_LOCK."""
    agent = NotionSyncAgent(token)
    children = agent.get_child_pages(hub_page_id)
    if children:
        sync_result = agent.sync_hub(hub_page_id)
    else:
        sync_result = agent.sync_to_db(hub_page_id)

    from build_curriculum import build_all_units
    units = build_all_units(force=False)

    now_iso = datetime.now(timezone.utc).isoformat()
    if children:
        for child in children:
            p_id = child["page_id"]
            meta = agent.get_page_metadata(p_id)
            if meta.get("last_edited_time"):
                upsert_notion_page_sync_state(p_id, meta["last_edited_time"])
    else:
        meta = agent.get_page_metadata(hub_page_id)
        if meta.get("last_edited_time"):
            upsert_notion_page_sync_state(hub_page_id, meta["last_edited_time"])

    SYNC_STATUS["last_synced_at"] = now_iso
    SYNC_STATUS["last_checked_at"] = now_iso
    return {
        "sync_result": sync_result,
        "units_count": len(units),
    }

def run_notion_auto_sync_watcher():
    """Background daemon thread checking Notion revisions every NOTION_SYNC_INTERVAL_MINUTES."""
    time.sleep(30)  # Initial 30-second delay after startup
    while True:
        try:
            token = os.environ.get("NOTION_TOKEN", "").strip()
            page_id = os.environ.get("NOTION_PAGE_ID", "").strip()
            if not token or "your_notion_internal" in token or not page_id:
                time.sleep(60)
                continue

            agent = NotionSyncAgent(token)
            clean_page_id = page_id.replace("-", "")

            stored_states = get_all_notion_page_sync_states()
            child_pages = agent.get_child_pages(clean_page_id)
            pages_to_check = child_pages if child_pages else [{"page_id": clean_page_id, "title": "Hub"}]

            has_changes = False
            for p in pages_to_check:
                pid = p["page_id"]
                meta = agent.get_page_metadata(pid)
                curr_last_edited = meta.get("last_edited_time")
                prev_last_edited = stored_states.get(pid)
                if not prev_last_edited or curr_last_edited != prev_last_edited:
                    has_changes = True
                    break

            now_iso = datetime.now(timezone.utc).isoformat()
            SYNC_STATUS["last_checked_at"] = now_iso

            if has_changes:
                logger.info("🔄 [AUTO_SYNC] Notion change detected! Starting autonomous sync & unit rebuild...")
                if SYNC_LOCK.acquire(blocking=False):
                    try:
                        SYNC_STATUS["is_syncing"] = True
                        res = perform_notion_sync_and_build(clean_page_id, token)
                        logger.info("✅ [AUTO_SYNC] Autonomous sync completed successfully! Built %d units.", res['units_count'])
                    except Exception as sync_err:
                        logger.error("❌ [AUTO_SYNC] Error during auto-sync: %s", sync_err)
                        SYNC_STATUS["last_error"] = str(sync_err)
                    finally:
                        SYNC_STATUS["is_syncing"] = False
                        SYNC_LOCK.release()
                else:
                    logger.info("🔄 [AUTO_SYNC] Sync lock is currently held by another process; skipping auto-sync tick.")
            else:
                logger.info("🔄 [AUTO_SYNC] No Notion changes detected.")

        except Exception as err:
            logger.warning("⚠️ [AUTO_SYNC] Watcher error: %s", err)
            SYNC_STATUS["last_error"] = str(err)

        interval_sec = max(60, NOTION_SYNC_INTERVAL_MINUTES * 60)
        time.sleep(interval_sec)

# Start background watcher daemon
watcher_thread = threading.Thread(target=run_notion_auto_sync_watcher, daemon=True, name="NotionAutoSyncWatcher")
watcher_thread.start()

_kks = pykakasi.kakasi()

def sanitize_user(user: dict) -> dict:
    if not user:
        return {}
    u = dict(user)
    u.pop("password_hash", None)
    return u

def annotate_romaji(text: str) -> str:
    if not text or not str(text).strip():
        return ""
    t = str(text).strip()
    if not re.search(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]', t):
        return ""

    COMMON_OVERRIDES = {
        'こんにちは': 'konnichiwa',
        'こんばんは': 'konbanwa',
        'おやすみなさい': 'oyasuminasai',
        'はい、おわりました。': 'hai, owarimashita.',
        'おわりましたか。': 'owarimashita ka?',
        '私はアディティヤです。': 'watashi wa Aditya desu.',
        'いただきます。': 'itadakimasu.',
        'ごちそうさまでした。': 'gochisousama deshita.',
        '行ってきます。': 'itte kimasu.',
        '行ってらっしゃい。': 'itterasshai.',
        'ただいま。': 'tadaima.',
        'お帰りなさい。': 'okaerinasai.',
        'はじめまして。': 'hajimemashite.',
        'よろしくお願いします。': 'yoroshiku onegaishimasu.',
        'さようなら': 'sayounara',
        'じゃ、また': 'ja, mata',
        'じゃ、また明日': 'ja, mata ashita',
        'どうも': 'doumo',
        'ありがとう': 'arigatou',
        'ありがとうございます': 'arigatou gozaimasu',
        'どうもありがとうございます': 'doumo arigatou gozaimasu',
        'すみません': 'sumimasen',
        'いいえ': 'iie',
        'はい': 'hai',
    }
    if t in COMMON_OVERRIDES:
        return COMMON_OVERRIDES[t]

    result = _kks.convert(t)
    parts = []
    for item in result:
        hep = item.get('hepburn', '')
        if hep:
            parts.append(hep)
    romaji_str = " ".join(parts).strip()
    romaji_str = re.sub(r'\bha\b', 'wa', romaji_str)
    romaji_str = re.sub(r'\bhe\b', 'e', romaji_str)
    return romaji_str

async def synthesize_lazy_audio(phrase: str, filepath: Path) -> bool:
    """Lazy synthesizes Japanese audio using Edge-TTS and caches it to disk."""
    try:
        os.makedirs(filepath.parent, exist_ok=True)
        comm = edge_tts.Communicate(phrase, voice="ja-JP-NanamiNeural", rate="-10%")
        await comm.save(str(filepath))
        return filepath.exists() and filepath.stat().st_size > 0
    except Exception as e:
        logger.error("❌ [LAZY_TTS] Failed to synthesize audio for '%s': %s", phrase, e)
        return False

# ==================== FastAPI App Setup ====================
app = FastAPI(title="Nihongo Sensei API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def authenticate_user(request: Request) -> Optional[dict]:
    auth_header = request.headers.get("Authorization")
    user, err = get_current_user_from_header(auth_header)
    return user

def require_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization")
    user, err = get_current_user_from_header(auth_header)
    if err or not user:
        raise HTTPException(status_code=401, detail=err or "Authentication required.")
    return user

def require_admin(request: Request) -> dict:
    user = require_user(request)
    ok, err = require_admin_role(user)
    if not ok:
        raise HTTPException(status_code=403, detail=err or "Admin role required.")
    return user

# -------------------- Audio Endpoint with On-Demand Lazy TTS --------------------
_audio_synthesis_locks: Dict[str, asyncio.Lock] = {}
_audio_synthesis_meta_lock = asyncio.Lock()

async def get_audio_file_lock(filename: str) -> asyncio.Lock:
    async with _audio_synthesis_meta_lock:
        if filename not in _audio_synthesis_locks:
            _audio_synthesis_locks[filename] = asyncio.Lock()
        return _audio_synthesis_locks[filename]

@app.get("/static/audio/{filename}")
async def serve_audio_file(filename: str):
    file_path = STATIC_AUDIO_DIR / filename
    if file_path.exists() and file_path.is_file() and file_path.stat().st_size > 0:
        return FileResponse(file_path, media_type="audio/mpeg")

    lock = await get_audio_file_lock(filename)
    async with lock:
        # Re-check existence inside lock to avoid duplicate synthesis
        if file_path.exists() and file_path.is_file() and file_path.stat().st_size > 0:
            return FileResponse(file_path, media_type="audio/mpeg")

        # On-demand lazy synthesis: look up the Japanese phrase for this audio file
        conn = get_connection()
        cur = conn.cursor()
        phrase = ""

        # 1. Search mastery_items table
        cur.execute("SELECT japanese, kana_only FROM mastery_items WHERE audio_path LIKE ? LIMIT 1", (f"%{filename}",))
        row = cur.fetchone()
        if row:
            phrase = row["kana_only"] or row["japanese"]
        else:
            # 2. Search kaggle_audio table
            cur.execute("SELECT transcript FROM kaggle_audio WHERE file_path LIKE ? LIMIT 1", (f"%{filename}",))
            krow = cur.fetchone()
            if krow:
                phrase = krow["transcript"]
            else:
                # 3. Check hash match against mastery items
                name_no_ext = filename.replace(".mp3", "")
                cur.execute("SELECT japanese, kana_only FROM mastery_items")
                for m in cur.fetchall():
                    t = (m["kana_only"] or m["japanese"]).strip()
                    if hashlib.md5(t.encode("utf-8")).hexdigest() == name_no_ext:
                        phrase = t
                        break
        conn.close()

        if phrase:
            logger.info("🎙️ [LAZY_TTS] Generating on-demand audio for '%s' -> %s", phrase, filename)
            try:
                success = await asyncio.wait_for(synthesize_lazy_audio(phrase, file_path), timeout=10.0)
                if success and file_path.exists() and file_path.stat().st_size > 0:
                    return FileResponse(file_path, media_type="audio/mpeg")
            except asyncio.TimeoutError:
                logger.error("❌ [LAZY_TTS] Timeout generating audio for '%s'", phrase)

    return JSONResponse(status_code=404, content={"error": "Audio file not found", "file": filename})

# -------------------- Live Sensei WebSocket Route --------------------
@app.websocket("/api/live/session")
async def websocket_live_session(websocket: WebSocket):
    await websocket.accept()
    try:
        await handle_live_session(websocket)
    except Exception as e:
        logger.info("WebSocket connection closed or ended: %s", e)

# -------------------- Health & Status Routes --------------------
@app.get("/health")
@app.get("/api/health")
async def health_check():
    db_type = "Turso Remote SQLite" if is_turso_configured() else "Local SQLite (db/nihongo.db)"
    return {
        "status": "online",
        "app": "Nihongo Sensei",
        "database": db_type,
        "unified_server": True,
        "endpoints": [
            "GET /health",
            "GET /api/syllabus/classes",
            "GET /api/roadmap",
            "GET /api/units/{unit_number}",
            "POST /api/sync/notion",
            "POST /api/build-units",
            "POST /api/progress/submit",
            "WS /api/live/session"
        ]
    }

@app.get("/api/live/status")
async def live_status():
    return {
        "status": "online",
        "ws_endpoint": "/api/live/session",
        "waterfall": [
            {"id": "gemini-3.8-live", "display": "gemini-3.8-live", "tier": "Best"},
            {"id": "gemini-3.1-flash-live-preview", "display": "gemini-3-flash-live", "tier": "Fast Fallback"},
            {"id": "gemini-2.5-flash-native-audio-latest", "display": "gemini-2.5-flash-native-audio-dialog", "tier": "Native Audio Fallback"}
        ]
    }

@app.get("/api/sync/status")
async def sync_status():
    return {
        "status": "ok",
        **SYNC_STATUS
    }

# -------------------- Auth Endpoints --------------------
@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
async def auth_register(request: Request):
    body = await request.json()
    email = str(body.get("email") or "").strip().lower()
    name = str(body.get("name") or "").strip()
    password = str(body.get("password") or "")

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    if get_user_by_email(email):
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    is_admin = False
    if admin_email:
        if email == admin_email:
            is_admin = True
    elif get_users_count() == 0:
        is_admin = True

    role = "admin" if is_admin else "student"
    user = create_user(
        email=email,
        name=name,
        password_hash=hash_password(password),
        auth_provider="local",
        role=role
    )
    token = create_access_token(user)
    return {
        "success": True,
        "token": token,
        "user": sanitize_user(user)
    }

@app.post("/api/auth/login")
async def auth_login(request: Request):
    body = await request.json()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    user = get_user_by_email(email)
    if not user or not user.get("password_hash") or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user)
    return {
        "success": True,
        "token": token,
        "user": sanitize_user(user)
    }

@app.post("/api/auth/google")
async def auth_google(request: Request):
    body = await request.json()
    credential = str(body.get("credential") or body.get("id_token") or body.get("token") or "").strip()
    if not credential:
        raise HTTPException(status_code=400, detail="Google ID token credential is required.")

    claims = verify_google_token(credential)
    if not claims or not claims.get("email"):
        raise HTTPException(status_code=401, detail="Invalid or expired Google credential.")

    email = claims["email"].strip().lower()
    name = claims.get("name") or claims.get("given_name") or "Japanese Learner"
    avatar_url = claims.get("picture")

    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    is_admin = False
    if admin_email:
        if email == admin_email:
            is_admin = True
    elif get_users_count() == 0:
        is_admin = True

    role = "admin" if is_admin else "student"
    user = upsert_google_user(email, name, avatar_url=avatar_url, default_role=role)
    token = create_access_token(user)
    return {
        "success": True,
        "token": token,
        "user": sanitize_user(user)
    }

@app.get("/api/auth/me")
async def auth_me(request: Request):
    user = require_user(request)
    return {
        "success": True,
        "user": sanitize_user(user)
    }

# -------------------- Live Sessions --------------------
@app.get("/api/live/sessions")
async def get_live_sessions(request: Request):
    user = require_user(request)
    sessions = get_user_live_sessions(user["id"], limit=30)
    return {
        "status": "ok",
        "total": len(sessions),
        "sessions": sessions
    }

# -------------------- Syllabus & Preview --------------------
@app.get("/api/syllabus/classes")
async def syllabus_classes():
    classes = get_all_synced_classes()
    return {
        "total_classes": len(classes),
        "classes": classes,
    }

@app.get("/api/syllabus/preview")
async def syllabus_preview(page_id: Optional[str] = None):
    clean_id = (page_id or "").replace("-", "")
    if not clean_id:
        classes = get_all_synced_classes()
        if classes:
            clean_id = classes[-1]["page_id"]
        else:
            clean_id = os.environ.get("NOTION_PAGE_ID", "").replace("-", "")

    record = get_notion_sync(clean_id)
    if not record:
        return {
            "synced": False,
            "message": "No synced notes found in database yet. Trigger /api/sync/notion.",
        }
    return {
        "synced": True,
        "page_id": record["page_id"],
        "title": record["title"],
        "content_hash": record["content_hash"],
        "last_edited_time": record["last_edited_time"],
        "synced_at": record["synced_at"],
        "markdown": record["raw_markdown"],
    }

# -------------------- Roadmap & Units --------------------
@app.get("/api/roadmap")
async def get_roadmap(request: Request):
    user = require_user(request)
    units = get_user_roadmap(user["id"])
    roadmap = []
    unlocked = True
    for u in units:
        is_comp = bool(u.get("is_completed", 0))
        roadmap.append({
            "id": u["id"],
            "unit_number": u["unit_number"],
            "unit_type": u.get("unit_type", "DAILY"),
            "title": u["title"],
            "is_completed": is_comp,
            "is_locked": not unlocked,
            "best_accuracy": u.get("best_accuracy", 0),
            "created_at": u.get("created_at"),
        })
        unlocked = is_comp

    return {
        "total_units": len(roadmap),
        "roadmap": roadmap,
    }

@app.get("/api/units/{unit_number}")
async def get_unit_details(unit_number: int, request: Request):
    user = require_user(request)
    unit = get_unit(unit_number)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unit {unit_number} not found.")

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT is_completed FROM user_unit_progress WHERE user_id = ? AND unit_number = ?",
        (user["id"], unit_number)
    )
    user_prog = cur.fetchone()
    is_comp = bool(user_prog["is_completed"]) if user_prog else False

    mastery = get_mastery_items_for_unit(unit["id"])
    unit_data = unit.get("lesson_data", {})
    unit_data["unit_id"] = unit["id"]
    unit_data["unit_number"] = unit["unit_number"]
    unit_data["unit_type"] = unit.get("unit_type", "DAILY")
    unit_data["is_completed"] = is_comp
    unit_data["mastery_item_count"] = len(mastery)

    mastery_map = {}
    for m in mastery:
        if m.get("japanese"):
            mastery_map[m["japanese"]] = m["id"]
        if m.get("kana_only"):
            mastery_map[m["kana_only"]] = m["id"]

    romaji_lookup = {}
    for card in unit_data.get("study_cards", []):
        jp = card.get("japanese") or card.get("kana_only") or ""
        if jp in mastery_map:
            card["id"] = mastery_map[jp]
        kana = card.get("kana_only") or ""
        romaji = (card.get("romaji") or "").strip()
        if romaji and jp:
            key = romaji.lower().rstrip(".?!").strip()
            display = f"{jp}（{kana}）" if kana and kana != jp and re.search(r'[\u4e00-\u9fff]', jp) else jp
            romaji_lookup[key] = (display, romaji.lower(), jp)

    cur.execute("SELECT japanese, kana_only, romaji FROM mastery_items")
    for r in cur.fetchall():
        jp = r["japanese"]
        kana = r["kana_only"] or ""
        romaji = (r["romaji"] or "").strip()
        if romaji and jp:
            key = romaji.lower().rstrip(".?!").strip()
            if key not in romaji_lookup:
                display = f"{jp}（{kana}）" if kana and kana != jp and re.search(r'[\u4e00-\u9fff]', jp) else jp
                romaji_lookup[key] = (display, romaji.lower(), jp)
    conn.close()

    EXTRA_ROMAJI_MAP = {
        'oyasuminasai': ('おやすみなさい', 'oyasuminasai', 'おやすみなさい'),
        'ohayou gozaimasu': ('おはようございます', 'ohayou gozaimasu', 'おはようございます'),
        'konnichiwa': ('こんにちは', 'konnichiwa', 'こんにちは'),
        'sumimasen': ('すみません', 'sumimasen', 'すみません'),
        'arigatou': ('ありがとう', 'arigatou', 'ありがとう'),
        'owarimashita': ('おわりました', 'owarimashita', 'おわりました'),
        'iie': ('いいえ。', 'iie', 'いいえ'),
        'hai': ('はい。', 'hai', 'はい'),
        'hai, owarimashita': ('はい、おわりました。', 'hai, owarimashita', 'はい、おわりました。'),
        'yo-ji': ('4時（よじ）', 'yo-ji', 'よじ'),
        'yon-ji': ('4時（よじ）', 'yon-ji', 'よじ'),
        'ku-ji': ('9時（くじ）', 'ku-ji', 'くじ'),
    }
    for k, v in EXTRA_ROMAJI_MAP.items():
        if k not in romaji_lookup:
            romaji_lookup[k] = v

    exercises = unit_data.get("exercises", [])
    for ex in exercises:
        target = ex.get("target_phrase") or ex.get("target_kana") or ""
        clean_target = target.strip().rstrip("。！？.!?")
        if clean_target in mastery_map:
            ex["item_id"] = mastery_map[clean_target]
        elif target in mastery_map:
            ex["item_id"] = mastery_map[target]
        ex["target_romaji"] = annotate_romaji(target)
        options = ex.get("options", [])
        option_details = []
        for opt in options:
            opt_str = str(opt).strip()
            opt_key = opt_str.lower().rstrip(".?!").strip()
            if opt_key in romaji_lookup and not re.search(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]', opt_str):
                disp, rom, orig_jp = romaji_lookup[opt_key]
                option_details.append({
                    "text": disp,
                    "romaji": rom,
                    "raw": opt_str,
                    "japanese_orig": orig_jp,
                })
            else:
                option_details.append({
                    "text": opt_str,
                    "romaji": annotate_romaji(opt_str),
                    "raw": opt_str,
                })
        ex["option_details"] = option_details

        raw_correct = str(ex.get("correct_answer") or "").strip()
        raw_key = raw_correct.lower().rstrip(".?!").strip()
        if raw_key in romaji_lookup and not re.search(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]', raw_correct):
            disp, rom, orig_jp = romaji_lookup[raw_key]
            ex["correct_answer_upgraded"] = disp
            ex["correct_answer_raw"] = raw_correct
        else:
            ex["correct_answer_upgraded"] = raw_correct
            ex["correct_answer_raw"] = raw_correct

    unit_data["exercises"] = exercises

    for card in unit_data.get("study_cards", []):
        if not card.get("romaji"):
            card["romaji"] = annotate_romaji(card.get("kana_only") or card.get("japanese") or "")

    return unit_data

# -------------------- Bank & Review --------------------
@app.get("/api/bank")
async def get_bank(request: Request):
    user = require_user(request)
    rows = get_user_bank_items(user["id"])
    for item in rows:
        if not item.get("romaji"):
            item["romaji"] = annotate_romaji(item.get("kana_only") or item.get("japanese") or "")
        item["trap_note"] = item.get("pronunciation_tip") or ""
        item["english_meaning"] = item.get("english") or ""
        item["marathi_meaning"] = item.get("marathi") or ""

    return {
        "total_items": len(rows),
        "items": rows,
    }

@app.get("/api/review/due")
async def get_due_review(request: Request, limit: int = 30):
    user = require_user(request)
    due_items = get_user_due_mastery_items(user["id"], limit=limit)
    return {
        "due_count": len(due_items),
        "items": due_items,
    }

# -------------------- Admin Notion & Curriculum Sync --------------------
def _sync_notion_task(token: str, page_id: str) -> dict:
    agent = NotionSyncAgent(token)
    children = agent.get_child_pages(page_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    if children:
        result = agent.sync_hub(page_id)
        for child in children:
            meta = agent.get_page_metadata(child["page_id"])
            if meta.get("last_edited_time"):
                upsert_notion_page_sync_state(child["page_id"], meta["last_edited_time"])
        return {
            "resp": {
                "success": True,
                "type": "hub",
                "hub_title": result["hub_title"],
                "total_classes": result["total_classes"],
                "classes": result["classes"],
            },
            "now_iso": now_iso,
        }
    else:
        result = agent.sync_to_db(page_id)
        meta = agent.get_page_metadata(page_id)
        if meta.get("last_edited_time"):
            upsert_notion_page_sync_state(page_id, meta["last_edited_time"])
        return {
            "resp": {
                "success": True,
                "type": "page",
                "page_id": result["page_id"],
                "title": result["title"],
                "content_hash": result["content_hash"],
                "notes_length": result["notes_length"],
                "preview": result["markdown"][:500],
            },
            "now_iso": now_iso,
        }

@app.post("/api/sync/notion")
async def sync_notion(request: Request):
    user = require_admin(request)
    if not SYNC_LOCK.acquire(blocking=False):
        return JSONResponse(
            status_code=409,
            content={
                "status": "already_syncing",
                "message": "A Notion sync or unit build is already in progress."
            }
        )

    try:
        SYNC_STATUS["is_syncing"] = True
        body = await request.json() if (await request.body()) else {}
        token = os.environ.get("NOTION_TOKEN", "").strip()
        page_id = (body.get("page_id") or os.environ.get("NOTION_PAGE_ID", "")).strip()

        if not token or "your_notion_internal" in token:
            raise HTTPException(status_code=400, detail="NOTION_TOKEN is not configured in .env.")
        if not page_id:
            raise HTTPException(status_code=400, detail="NOTION_PAGE_ID is missing.")

        sync_result = await asyncio.to_thread(_sync_notion_task, token, page_id)
        SYNC_STATUS["last_synced_at"] = sync_result["now_iso"]
        SYNC_STATUS["last_checked_at"] = sync_result["now_iso"]
        return sync_result["resp"]
    except HTTPException:
        raise
    except Exception as e:
        SYNC_STATUS["last_error"] = str(e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        SYNC_STATUS["is_syncing"] = False
        SYNC_LOCK.release()

@app.post("/api/build-units")
async def build_units(request: Request):
    user = require_admin(request)
    if not SYNC_LOCK.acquire(blocking=False):
        return JSONResponse(
            status_code=409,
            content={
                "status": "already_syncing",
                "message": "A unit build or Notion sync is already in progress."
            }
        )

    try:
        SYNC_STATUS["is_syncing"] = True
        body = await request.json() if (await request.body()) else {}
        force = bool(body.get("force", False))
        from build_curriculum import build_all_units
        units = await asyncio.to_thread(build_all_units, force=force)
        return {
            "success": True,
            "built_units_count": len(units),
            "units": [{"unit_number": u.get("unit_number"), "title": u.get("unit_title")} for u in units]
        }
    except Exception as e:
        SYNC_STATUS["last_error"] = str(e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        SYNC_STATUS["is_syncing"] = False
        SYNC_LOCK.release()

# -------------------- SM-2 Progress & Grading --------------------
@app.post("/api/progress/submit")
async def submit_progress(request: Request):
    user = require_user(request)
    body = await request.json()
    unit_number = body.get("unit_number")
    is_completed = bool(body.get("is_completed", False))
    grades = body.get("grades", [])
    accuracy = float(body.get("accuracy", 1.0))
    earned_xp = int(body.get("earned_xp", 50 if is_completed else len(grades) * 15))

    if unit_number is None:
        raise HTTPException(status_code=400, detail="unit_number is required.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        boss_agent = MemoryBossAgent()
        updated_items = []
        for g in grades:
            raw_id = g.get("item_id")
            q = int(g.get("quality", 4))
            real_item_id = None

            if raw_id is not None:
                try:
                    cur.execute("SELECT id FROM mastery_items WHERE id = ?", (int(raw_id),))
                    row = cur.fetchone()
                    if row:
                        real_item_id = row["id"]
                except (ValueError, TypeError):
                    pass

            if not real_item_id:
                target_text = g.get("target") or g.get("japanese") or g.get("text")
                if target_text:
                    clean_text = str(target_text).strip().rstrip("。！？.!?")
                    cur.execute(
                        "SELECT id FROM mastery_items WHERE japanese = ? OR kana_only = ? LIMIT 1",
                        (clean_text, clean_text)
                    )
                    row = cur.fetchone()
                    if row:
                        real_item_id = row["id"]

            if not real_item_id:
                continue

            curr = get_user_mastery_item(user["id"], real_item_id)
            ef = curr["ease_factor"] if curr else 2.5
            iv = curr["interval_days"] if curr else 1
            rep = curr["repetitions"] if curr else 0
            wc = curr["wrong_count"] if curr else 0

            new_ef, new_iv, new_rep = boss_agent.calculate_sm2(q, ef, iv, rep)
            new_wc = wc + 1 if q < 3 else wc
            next_date = (date.today() + timedelta(days=new_iv)).isoformat()

            save_user_mastery(
                user_id=user["id"],
                item_id=real_item_id,
                ease_factor=new_ef,
                interval_days=new_iv,
                repetitions=new_rep,
                wrong_count=new_wc,
                next_review_date=next_date
            )
            updated_items.append({"item_id": real_item_id, "quality": q, "repetitions": new_rep})

        conn.close()

        if is_completed:
            mark_user_unit_completed(user["id"], int(unit_number), True, accuracy=accuracy)
            new_streak = max(user.get("streak", 0) + 1, 1)
            update_user_stats(user["id"], xp_delta=earned_xp, streak=new_streak)
        else:
            new_streak = max(user.get("streak", 0), 1)
            update_user_stats(user["id"], xp_delta=earned_xp, streak=new_streak)

        boss_unit = boss_agent.maybe_generate_boss_unit()
        fresh_user = get_user_by_id(user["id"])
        new_xp = fresh_user["xp"] if fresh_user else user.get("xp", 0)
        curr_streak = fresh_user["streak"] if fresh_user else user.get("streak", 0)

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
            "boss_unit_unlocked": boss_unit is not None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/grade")
async def grade_review_item(request: Request):
    user = require_user(request)
    body = await request.json()
    item_id = body.get("item_id")
    quality = body.get("quality", 4)
    if not item_id:
        raise HTTPException(status_code=400, detail="item_id is required.")

    try:
        boss_agent = MemoryBossAgent()
        curr = get_user_mastery_item(user["id"], int(item_id))
        ef = curr["ease_factor"] if curr else 2.5
        iv = curr["interval_days"] if curr else 1
        rep = curr["repetitions"] if curr else 0
        wc = curr["wrong_count"] if curr else 0

        new_ef, new_iv, new_rep = boss_agent.calculate_sm2(int(quality), ef, iv, rep)
        new_wc = wc + 1 if int(quality) < 3 else wc
        next_date = (date.today() + timedelta(days=new_iv)).isoformat()

        save_user_mastery(
            user_id=user["id"],
            item_id=int(item_id),
            ease_factor=new_ef,
            interval_days=new_iv,
            repetitions=new_rep,
            wrong_count=new_wc,
            next_review_date=next_date
        )
        update_user_stats(user["id"], xp_delta=10)
        return {
            "success": True,
            "item_id": item_id,
            "repetitions": new_rep,
            "interval_days": new_iv,
            "next_review_date": next_date
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -------------------- Frontend Static Assets & SPA Fallback --------------------
assets_dir = FRONTEND_DIST / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

@app.get("/{full_path:path}")
async def serve_spa_frontend(full_path: str):
    # Guard against intercepting API and static routes
    if full_path.startswith("api/") or full_path.startswith("static/"):
        return JSONResponse(status_code=404, content={"error": "Not Found", "path": full_path})

    # Serve specific static files from frontend/dist if they exist (e.g. manifest.json, icons, favicon)
    if full_path:
        candidate_file = FRONTEND_DIST / full_path
        if candidate_file.is_file():
            return FileResponse(candidate_file)

    # Return index.html for SPA routes
    index_file = FRONTEND_DIST / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)

    return JSONResponse(status_code=200, content={
        "status": "online",
        "message": "Nihongo Sensei API is running. Build frontend with 'npm run build' to serve the UI."
    })

def run(port: int = PORT):
    logger.info("🌸 Nihongo Sensei Unified Server starting on http://0.0.0.0:%d", port)
    uvicorn.run(app, host="0.0.0.0", port=port)

if __name__ == "__main__":
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run(port_arg)
