#!/usr/bin/env python3
"""
Curriculum Builder Pipeline:
Connects Agent 1 (Notion Sync) -> Agent 2 (Curriculum Architect) -> Agent 3 (Media Enricher) -> Agent 4 (Memory/Mastery)
"""
import os
import sys
import json
from pathlib import Path
from typing import Dict, Any, List

sys.path.append(str(Path(__file__).resolve().parent))

from agents.notion_agent import ensure_env_loaded
from agents.curriculum_agent import CurriculumAgent
from agents.media_agent import MediaEnricherAgent
from agents.memory_boss_agent import MemoryBossAgent
from db.database import (
    init_database,
    get_all_synced_classes,
    get_notion_sync,
    save_unit,
    get_unit,
    get_unit_by_notion_page_id,
    save_mastery_item,
    upsert_mastery_item,
    batch_upsert_mastery_items,
    get_due_mastery_items,
    get_all_units,
    get_connection,
)

ensure_env_loaded()
init_database()

def build_all_units(force: bool = False) -> List[Dict[str, Any]]:
    """Builds curriculum units for all synced Notion classes in SQLite with hash-aware updating."""
    classes = get_all_synced_classes()
    if not classes:
        print("❌ No synced classes found in database. Run agents/notion_agent.py first.")
        return []

    # Exclude templates and non-class pages
    classes = [c for c in classes if "template" not in c["title"].lower()]

    print(f"📚 Found {len(classes)} synced class notes in database.")
    curriculum_agent = CurriculumAgent()
    media_agent = MediaEnricherAgent()
    boss_agent = MemoryBossAgent()

    built_units = []

    # Sort classes logically (e.g. Class 01 before Class 02)
    sorted_classes = sorted(classes, key=lambda c: c["title"])

    for idx, c in enumerate(sorted_classes, start=1):
        # 1. Match against existing unit by notion_page_id or unit_number
        existing_unit = get_unit_by_notion_page_id(c["page_id"])
        if not existing_unit:
            existing_unit = get_unit(idx)

        unit_num = existing_unit["unit_number"] if existing_unit else idx
        needs_rebuild = force or (existing_unit is None) or (existing_unit.get("content_hash") != c["content_hash"])

        if not needs_rebuild:
            print(f"✨ Unit {unit_num:02d} ('{existing_unit['title']}') is already up to date. Syncing any missing mastery cards.")
            # Ensure all cards in existing lesson_data are registered in mastery_items
            unit_id = existing_unit["id"]
            existing_cards = existing_unit.get("lesson_data", {}).get("study_cards", [])
            conn = get_connection()
            try:
                with conn:
                    saved_cards = batch_upsert_mastery_items(unit_id=unit_id, cards=existing_cards, conn=conn)
            finally:
                conn.close()
            built_units.append(existing_unit["lesson_data"])
            continue

        print(f"\n{'=' * 60}")
        print(f"🚀 Building/Updating Unit {unit_num:02d}: {c['title']} (Hash: {c['content_hash'][:8]})...")
        print(f"{'=' * 60}")

        # Fetch full raw markdown
        full_record = get_notion_sync(c["page_id"])
        raw_markdown = full_record["raw_markdown"]

        # Fetch past due items for cross-unit revision
        due_items = []
        if unit_num > 1:
            due_items = get_due_mastery_items(limit=6)
            print(f"🔄 Retrieved {len(due_items)} due items from earlier units for revision weaving.")

        # 1. Generate Structured DailyUnit via Agent 2
        daily_unit = curriculum_agent.generate_unit(
            unit_number=unit_num,
            raw_markdown=raw_markdown,
            due_items=due_items,
        )
        unit_dict = daily_unit.model_dump()
        unit_dict["notion_page_id"] = c["page_id"]
        unit_dict["content_hash"] = c["content_hash"]

        # 2. Enrich Audio and SVGs via Agent 3
        enriched_dict = media_agent.enrich_unit(unit_dict)

        # 3. Save Unit into SQLite in a single transaction
        conn = get_connection()
        try:
            with conn:
                unit_id = save_unit(
                    unit_number=unit_num,
                    title=enriched_dict["unit_title"],
                    lesson_json=json.dumps(enriched_dict, ensure_ascii=False),
                    unit_type="DAILY",
                    notion_page_id=c["page_id"],
                    content_hash=c["content_hash"],
                    is_completed=bool(existing_unit.get("is_completed", 0)) if existing_unit else False,
                    conn=conn,
                )

                # 4. Ingest/Upsert StudyCards into mastery_items (SM-2 Bank) in batch
                cards = enriched_dict.get("study_cards", [])
                saved_cards = batch_upsert_mastery_items(unit_id=unit_id, cards=cards, conn=conn)
        finally:
            conn.close()

        print(f"💾 Unit {unit_num:02d} saved to SQLite in place (ID: {unit_id}, {saved_cards} mastery cards upserted).")
        built_units.append(enriched_dict)

    # Check for 5-Unit Boss Checkpoint
    boss = boss_agent.maybe_generate_boss_unit()
    if boss:
        print(f"🏆 Boss Checkpoint Unit created: {boss['unit_title']}")
        built_units.append(boss)

    print(f"\n🎉 Curriculum build completed! {len(built_units)} units available in SQLite.")
    return built_units

if __name__ == "__main__":
    force_rebuild = "--force" in sys.argv
    build_all_units(force=force_rebuild)
