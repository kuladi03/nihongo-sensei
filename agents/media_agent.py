"""
Agent 3: Media & SVG Enricher
Handles audio resolution (Kaggle dataset lookup -> Edge-TTS neural speech fallback)
and SVG vector visual resolution (SQLite cache -> Iconify Open API).
"""
import os
import sys
import hashlib
import asyncio
import requests
from pathlib import Path
from typing import Optional, Dict, Any, List

# Ensure parent directory is in sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from db.database import (
    get_kaggle_audio,
    get_cached_svg,
    save_cached_svg,
)

STATIC_AUDIO_DIR = Path(__file__).resolve().parent.parent / "static" / "audio"
STANDARD_SVGS = {
    "book": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2B4C7E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    "alphabet": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2B4C7E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4.5-9 4.5 9"/><path d="M4.5 13h6"/><path d="M18 16V7l-4 4"/></svg>',
    "speaker": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2B4C7E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
    "warning": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#D94E34" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    "trophy": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#936D1C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    "question": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2B4C7E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    "puzzle": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4A7C59" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c-.049-.322-.059-.652-.029-.982.09-.993.689-1.868 1.59-2.298-1.579-1.92-3.869-2.57-6.099-2.57-1.16 0-2.31.2-3.37.59.39 1.06.39 2.21 0 3.27-.39 1.06-1.18 1.9-2.24 2.29-1.06.39-2.21.39-3.27 0C5.631 9.28 5.431 10.43 5.431 11.59c0 2.23.65 4.52 2.57 6.1.43-.9.98-1.5 2.29-1.59.33-.03.66-.02.98.03.32.05.63.16.92.32 1.06.59 1.7 1.7 1.7 2.91 0 .28-.04.56-.12.83 1.06.39 2.21.59 3.37.59 2.23 0 4.52-.65 6.1-2.57-.43-.9-.98-1.5-2.29-1.59-.33-.03-.66-.02-.98.03-.32.05-.63.16-.92.32-1.06.59-1.7 1.7-1.7 2.91"/></svg>',
    "microphone": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#D94E34" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
    "star": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#C9972C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    "clock": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2B4C7E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    "coffee": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#936D1C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
    "chat": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2B4C7E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    "user": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2B4C7E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
}

class MediaEnricherAgent:
    def __init__(self, voice: str = "ja-JP-NanamiNeural", rate: str = "-10%"):
        self.voice = voice
        self.rate = rate

    def resolve_audio(self, phrase: str) -> str:
        """
        Resolves audio file path for a given Japanese phrase:
        1. Checks kaggle_audio table.
        2. Fallback: computes deterministic MD5 hash for on-demand lazy TTS.
        Audio synthesis is handled on-demand by /static/audio/{filename} in server.py,
        preventing event loop deadlocks and avoiding 75s+ eager synthesis during sync.
        Returns public URL path: /static/audio/<hash>.mp3
        """
        if not phrase or not phrase.strip():
            return ""

        text = phrase.strip()

        # 1. Check Kaggle audio table
        kaggle_file = get_kaggle_audio(text)
        if kaggle_file and Path(kaggle_file).exists():
            return f"/static/audio/{Path(kaggle_file).name}"

        # 2. Deterministic MD5 hash for on-demand lazy TTS
        phrase_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
        return f"/static/audio/{phrase_hash}.mp3"

    def resolve_svg(self, keyword: str) -> str:
        """
        Resolves SVG markup for a given keyword with zero blocking network calls:
        1. Checks SQLite svg_cache table.
        2. Fallback: Matches against standard preset in-memory SVG library.
        3. Fallback: Returns clean generic SVG immediately without network requests.
        """
        if not keyword or not keyword.strip():
            keyword = "book"

        kw = keyword.strip().lower()

        # 1. Check SQLite cache
        cached = get_cached_svg(kw)
        if cached:
            return cached

        # 2. Check in-memory preset SVGs
        matched_svg = STANDARD_SVGS.get(kw)
        if not matched_svg:
            for k, svg in STANDARD_SVGS.items():
                if k in kw or kw in k:
                    matched_svg = svg
                    break

        if not matched_svg:
            matched_svg = STANDARD_SVGS["book"]

        # Cache in SQLite for future lookups
        try:
            save_cached_svg(kw, matched_svg)
        except Exception:
            pass

        return matched_svg

    def enrich_unit(self, unit_data: Dict[str, Any]) -> Dict[str, Any]:
        """Enriches all study cards and exercises in a unit with audio and SVGs."""
        print(f"🎨 Enriching Unit {unit_data.get('unit_number')}: '{unit_data.get('unit_title')}'...")

        # Enrich study cards
        cards = unit_data.get("study_cards", [])
        for idx, card in enumerate(cards):
            target = card.get("kana_only") or card.get("japanese", "")
            card["audio_path"] = self.resolve_audio(target)
            kw = card.get("svg_keyword") or "book"
            card["svg_markup"] = self.resolve_svg(kw)

        # Enrich exercises
        exercises = unit_data.get("exercises", [])
        for idx, ex in enumerate(exercises):
            # Target phrase audio
            target_kana = ex.get("target_kana") or ex.get("target_phrase", "")
            ex["audio_path"] = self.resolve_audio(target_kana)

            # Exercise SVG icon (from type or keyword)
            ex_type = ex.get("type", "TILE_BUILDER")
            type_keywords = {
                "AUDIO_TO_MEANING": "speaker",
                "PRONUNCIATION_TRAP": "warning",
                "POLITENESS_RANK": "trophy",
                "SITUATIONAL_CHOICE": "question",
                "TILE_BUILDER": "puzzle",
                "SPEAKING_CHECK": "microphone",
            }
            kw = type_keywords.get(ex_type, "star")
            ex["svg_markup"] = self.resolve_svg(kw)

        print(f"✅ Enriched {len(cards)} study cards and {len(exercises)} exercises!")
        return unit_data

if __name__ == "__main__":
    agent = MediaEnricherAgent()
    audio = agent.resolve_audio("こんにちは")
    svg = agent.resolve_svg("bowing")
    print("Test Audio URL:", audio)
    print("Test SVG length:", len(svg))
