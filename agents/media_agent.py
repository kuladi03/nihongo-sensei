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
STATIC_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

class MediaEnricherAgent:
    def __init__(self, voice: str = "ja-JP-NanamiNeural", rate: str = "-10%"):
        self.voice = voice
        self.rate = rate

    def resolve_audio(self, phrase: str) -> str:
        """
        Resolves audio file path for a given Japanese phrase:
        1. Checks kaggle_audio table.
        2. Fallback: Edge-TTS generation cached by MD5 in static/audio/.
        Returns public URL path: /static/audio/<hash>.mp3
        """
        if not phrase or not phrase.strip():
            return ""

        text = phrase.strip()

        # 1. Check Kaggle audio table
        kaggle_file = get_kaggle_audio(text)
        if kaggle_file and Path(kaggle_file).exists():
            return f"/static/audio/{Path(kaggle_file).name}"

        # 2. Edge-TTS fallback
        phrase_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
        filename = f"{phrase_hash}.mp3"
        filepath = STATIC_AUDIO_DIR / filename
        public_url = f"/static/audio/{filename}"

        if filepath.exists() and filepath.stat().st_size > 0:
            return public_url

        try:
            import edge_tts

            async def _synthesize():
                comm = edge_tts.Communicate(text, voice=self.voice, rate=self.rate)
                await comm.save(str(filepath))

            try:
                asyncio.run(_synthesize())
            except RuntimeError:
                # In case an event loop is already running in current thread
                loop = asyncio.new_event_loop()
                loop.run_until_complete(_synthesize())
                loop.close()

            return public_url
        except Exception as e:
            print(f"⚠️ Audio generation error for '{text}': {e}")
            return ""

    def resolve_svg(self, keyword: str) -> str:
        """
        Resolves SVG markup for a given keyword:
        1. Checks svg_cache table.
        2. Fallback: Iconify search (fluent-emoji-flat, twemoji).
        Returns <svg>...</svg> string.
        """
        if not keyword or not keyword.strip():
            keyword = "bookmark"

        kw = keyword.strip().lower()

        # 1. Check cache
        cached = get_cached_svg(kw)
        if cached:
            return cached

        # 2. Query Iconify search
        try:
            search_url = f"https://api.iconify.design/search?query={kw}&prefixes=fluent-emoji-flat,twemoji&limit=1"
            res = requests.get(search_url, timeout=5)
            if res.status_code == 200:
                data = res.json()
                icons = data.get("icons", [])
                if icons:
                    icon_name = icons[0]
                    prefix, name = icon_name.split(":", 1)
                    svg_url = f"https://api.iconify.design/{prefix}/{name}.svg"
                    svg_res = requests.get(svg_url, timeout=5)
                    if svg_res.status_code == 200 and "<svg" in svg_res.text:
                        svg_markup = svg_res.text.strip()
                        save_cached_svg(kw, svg_markup)
                        return svg_markup
        except Exception as e:
            print(f"⚠️ SVG resolution error for '{kw}': {e}")

        # Fallback generic SVG
        generic_svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
            f'stroke="#4F46E5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            f'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
        )
        return generic_svg

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
