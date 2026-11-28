"""
Agent 4: SM-2 Spaced Repetition Engine & 5-Unit Cumulative Boss Checkpoint Generator
Tracks mastery intervals, handles mistake-driven repetition, and crafts Boss trials every 5 units.
"""
import os
import sys
import json
from datetime import date, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List

sys.path.append(str(Path(__file__).resolve().parent.parent))

from agents.notion_agent import ensure_env_loaded
from db.database import (
    get_connection,
    update_mastery_srs,
    save_unit,
    get_all_units,
    batch_upsert_mastery_items,
)

ensure_env_loaded()

class MemoryBossAgent:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")

    # --- SM-2 Memory Engine ---
    @staticmethod
    def calculate_sm2(quality: int, ef: float, interval: int, repetitions: int):
        """
        Pure calculation function for SM-2 Spaced Repetition:
        quality: 0 to 5
        Returns (new_ef, new_interval, new_repetitions)
        """
        q = max(0, min(5, quality))
        current_ef = float(ef or 2.5)
        current_iv = int(interval or 1)
        reps = int(repetitions or 0)

        if q < 3:
            new_reps = 0
            new_iv = 1
        else:
            if reps == 0:
                new_iv = 1
            elif reps == 1:
                new_iv = 6
            else:
                new_iv = max(1, min(round(current_iv * current_ef), 365))
            new_reps = reps + 1

        new_iv = max(1, min(int(new_iv), 365))
        new_ef = current_ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
        new_ef = max(1.3, round(new_ef, 3))
        return new_ef, new_iv, new_reps

    def record_attempt(self, item_id: int, quality: int) -> Dict[str, Any]:
        """
        Updates mastery_items for a single item using the official SM-2 algorithm:
        q in [0..5]
        If q < 3: repetitions = 0, interval = 1, wrong_count += 1
        If q >= 3:
            repetitions == 0 -> interval = 1
            repetitions == 1 -> interval = 6
            repetitions >= 2 -> interval = round(interval * EF)
            repetitions += 1
        EF' = max(1.3, EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
        """
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, ease_factor, interval_days, repetitions, wrong_count, japanese FROM mastery_items WHERE id = %s", (item_id,))
        row = cur.fetchone()
        conn.close()

        if not row:
            raise ValueError(f"Mastery item {item_id} not found.")

        current_ef = float(row["ease_factor"] or 2.5)
        interval = int(row["interval_days"] or 1)
        repetitions = int(row["repetitions"] or 0)
        wrong_count = int(row["wrong_count"] or 0)
        japanese = row["japanese"]

        q = max(0, min(5, quality))

        if q < 3:
            repetitions = 0
            interval = 1
            wrong_count += 1
        else:
            if repetitions == 0:
                interval = 1
            elif repetitions == 1:
                interval = 6
            else:
                interval = max(1, min(round(interval * current_ef), 365))
            repetitions += 1

        interval = max(1, min(int(interval), 365))
        # Calculate new ease factor
        new_ef = current_ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
        new_ef = max(1.3, round(new_ef, 3))

        next_date = (date.today() + timedelta(days=interval)).isoformat()

        update_mastery_srs(
            item_id=item_id,
            ease_factor=new_ef,
            interval_days=interval,
            repetitions=repetitions,
            wrong_count=wrong_count,
            next_review_date=next_date,
        )

        return {
            "item_id": item_id,
            "japanese": japanese,
            "quality": q,
            "new_repetitions": repetitions,
            "new_interval_days": interval,
            "new_ease_factor": new_ef,
            "wrong_count": wrong_count,
            "next_review_date": next_date,
        }

    # --- 5-Unit Boss Checkpoint Generator ---
    def maybe_generate_boss_unit(self, force: bool = False) -> Optional[Dict[str, Any]]:
        """
        Checks if a 5-unit block is completed. If count(DAILY) % 5 == 0 and
        no BOSS_5 unit exists for this milestone, builds a cumulative Boss Unit.
        """
        all_units = get_all_units()
        daily_units = [u for u in all_units if u.get("unit_type") == "DAILY"]
        daily_count = len(daily_units)

        if daily_count < 5 or daily_count % 5 != 0:
            return None

        boss_unit_num = daily_count + (daily_count // 5)
        # Check if boss unit already exists
        boss_exists = any(u.get("unit_number") == boss_unit_num for u in all_units)
        if boss_exists and not force:
            return None

        start_unit = daily_count - 4
        end_unit = daily_count
        print(f"👑 Triggering 5-Unit Boss Checkpoint for Units {start_unit:02d} to {end_unit:02d}!")

        # Gather last 5 units items
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT m.* FROM mastery_items m
            JOIN units u ON m.unit_id = u.id
            WHERE u.unit_number BETWEEN %s AND %s
            ORDER BY m.wrong_count DESC
            LIMIT 30
        """, (start_unit, end_unit))
        pool_items = [dict(r) for r in cur.fetchall()]
        conn.close()

        # Build prompt for dialogue & cumulative trials
        items_summary = "\n".join(
            [f"- {i['japanese']} ({i.get('kana_only', '')}): {i.get('english')} | Nuance: {i.get('pronunciation_tip', '')}" for i in pool_items[:20]]
        )

        from agents.curriculum_agent import CurriculumAgent
        curr_agent = CurriculumAgent(self.api_key)

        boss_prompt = f"""
# 5-UNIT CUMULATIVE BOSS CHECKPOINT (Units {start_unit:02d} - {end_unit:02d})

We need a climactic, gold-trophy Boss Unit testing cumulative mastery of the past 5 classes.
### MASTERY VOCABULARY & PHRASES POOL:
{items_summary}

REQUIREMENTS:
1. Write a 4-line authentic Mini Classroom Dialogue in Japanese testing real situations (e.g. self-introduction, meal etiquette, asking time, classroom instructions).
   Include lines in study cards with full Marathi and English guidance.
2. 15 comprehensive Boss challenge exercises testing pronunciation traps, situation-appropriate bowing, politeness ranking, and time/number comprehension.
"""
        boss_unit = curr_agent.generate_unit(unit_number=boss_unit_num, raw_markdown=boss_prompt)
        boss_dict = boss_unit.model_dump()
        boss_dict["unit_title"] = f"👑 Boss Trial: Units {start_unit:02d}–{end_unit:02d} Mastery Dialogue"
        boss_dict["unit_type"] = "BOSS_5"

        # Media enrichment
        from agents.media_agent import MediaEnricherAgent
        media = MediaEnricherAgent()
        enriched = media.enrich_unit(boss_dict)

        # Save to database in a single transaction (parent units row first, then study_cards)
        conn = get_connection()
        try:
            with conn:
                unit_id = save_unit(
                    unit_number=boss_unit_num,
                    title=enriched["unit_title"],
                    lesson_json=json.dumps(enriched, ensure_ascii=False),
                    unit_type="BOSS_5",
                    notion_page_id=f"boss_{start_unit}_{end_unit}",
                    content_hash="boss_milestone",
                    is_completed=False,
                    conn=conn,
                )

                cards = enriched.get("study_cards", [])
                if cards:
                    batch_upsert_mastery_items(unit_id=unit_id, cards=cards, conn=conn)
        finally:
            conn.close()

        return enriched

if __name__ == "__main__":
    agent = MemoryBossAgent()
    print("Testing SM-2 record_attempt...")
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM mastery_items LIMIT 1")
    row = cur.fetchone()
    conn.close()
    if row:
        res = agent.record_attempt(row["id"], quality=4)
        print("SM-2 updated:", res)
    else:
        print("No mastery items yet (will test once Unit 01 is generated).")
