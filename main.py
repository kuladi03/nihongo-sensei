"""
Nihongo Sensei API (FastAPI)
"""
import os
import sys
from pathlib import Path
from typing import Optional

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
except ImportError:
    FastAPI = None

# Local imports
from agents.notion_agent import NotionSyncAgent, ensure_env_loaded
from db.database import init_database, get_notion_sync, get_connection

ensure_env_loaded()
init_database()

if FastAPI:
    app = FastAPI(
        title="Nihongo Sensei API",
        description="AI-powered Personal Japanese Sensei strictly built around your real syllabus.",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class SyncRequest(BaseModel):
        page_id: Optional[str] = None

    @app.get("/health")
    def health_check():
        return {
            "status": "online",
            "app": "Nihongo Sensei",
            "database": "SQLite (db/nihongo.db)",
        }

    @app.post("/api/sync/notion")
    def trigger_notion_sync(req: SyncRequest):
        token = os.environ.get("NOTION_TOKEN", "").strip()
        page_id = (req.page_id or os.environ.get("NOTION_PAGE_ID", "")).strip()

        if not token or "your_notion_internal" in token:
            raise HTTPException(
                status_code=400,
                detail="NOTION_TOKEN is not configured in .env. Please add your integration token.",
            )
        if not page_id:
            raise HTTPException(status_code=400, detail="NOTION_PAGE_ID is missing.")

        try:
            agent = NotionSyncAgent(token)
            result = agent.sync_to_db(page_id)
            return {
                "success": True,
                "page_id": result["page_id"],
                "title": result["title"],
                "content_hash": result["content_hash"],
                "notes_length": result["notes_length"],
                "preview": result["markdown"][:500],
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/syllabus/preview")
    def get_syllabus_preview(page_id: Optional[str] = None):
        target_id = (page_id or os.environ.get("NOTION_PAGE_ID", "")).replace("-", "")
        record = get_notion_sync(target_id)
        if not record:
            return {
                "synced": False,
                "message": "No synced notes found yet. Please trigger /api/sync/notion.",
            }
        return {
            "synced": True,
            "title": record["title"],
            "hash": record["content_hash"],
            "last_edited": record["last_edited_time"],
            "markdown": record["raw_markdown"],
        }

else:
    app = None
    print("FastAPI is not installed. To run the FastAPI server, install fastapi and uvicorn.")
    print("Alternatively, run 'python3 server.py' to use the zero-dependency built-in REST server.")
