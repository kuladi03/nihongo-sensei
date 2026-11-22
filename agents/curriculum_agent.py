"""
Agent 2: Curriculum Architect
Transforms raw Notion class notes into structured Daily Units (StudyCards + 6 Interactive Exercise types)
using Gemini with Pydantic structured output and SM-2 cross-unit revision weaving.
"""
import os
import sys
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

# Ensure parent directory is in sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from agents.notion_agent import ensure_env_loaded
from db.database import get_due_mastery_items

ensure_env_loaded()

import re
import hashlib

# --- Pydantic Data Contract ---
class StudyCard(BaseModel):
    japanese: str = Field(description="Japanese script (Kanji/Kana or pure Kana)")
    kana_only: str = Field(description="Pure Hiragana/Katakana reading for speech synthesis")
    romaji: str = Field(description="Standard Hepburn Romaji")
    english: str = Field(description="English meaning or translation")
    marathi: str = Field(description="Marathi translation and nuances from the class notes")
    pronunciation_tip: str = Field(description="Exact phonetic trap/cultural explanation from notes (e.g. unaspirated क vs ख, は as wa, bowing angles)")
    svg_keyword: str = Field(description="English keyword to search Iconify SVG (e.g. 'bowing', 'coffee', 'clock', 'desk', 'tea')")
    item_type: str = Field(description="One of: 'KANA', 'VOCAB', 'GRAMMAR', 'PHRASE'")
    audio_path: Optional[str] = Field(default=None, description="Enriched by Agent 3")
    svg_markup: Optional[str] = Field(default=None, description="Enriched by Agent 3")

class Exercise(BaseModel):
    type: str = Field(
        description="One of: 'AUDIO_TO_MEANING', 'PRONUNCIATION_TRAP', 'POLITENESS_RANK', 'SITUATIONAL_CHOICE', 'TILE_BUILDER', 'SPEAKING_CHECK'"
    )
    prompt: str = Field(description="Question or prompt shown to user in English/Marathi")
    target_phrase: str = Field(description="Main Japanese phrase tested")
    target_kana: str = Field(description="Kana-only target phrase for audio playback and speech recognition")
    options: List[str] = Field(description="Multiple-choice options OR scrambled tile fragments for TILE_BUILDER")
    correct_answer: str = Field(description="Correct option string, ordered CSV for POLITENESS_RANK, or full sentence for TILE_BUILDER")
    explanation: str = Field(description="Detailed pedagogical explanation including Marathi pronunciation trap cues")
    is_revision_item: bool = Field(default=False, description="True if this drill tests a due item from an earlier unit")
    audio_path: Optional[str] = Field(default=None, description="Enriched by Agent 3")
    svg_markup: Optional[str] = Field(default=None, description="Enriched by Agent 3")

class ExtractedCards(BaseModel):
    study_cards: List[StudyCard] = Field(description="Exhaustive study cards extracted from this section")

class ExercisesAndSummary(BaseModel):
    unit_title: str = Field(description="Title of unit, e.g. 'Unit 01: Hiragana Basics & Greetings'")
    focus_summary: str = Field(description="Summary of concepts, phonetics, and grammar covered")
    exercises: List[Exercise] = Field(description="15 progressive interactive exercises spanning all 6 types")

class DailyUnit(BaseModel):
    unit_number: int = Field(description="1-based unit sequence number")
    unit_title: str = Field(description="Title of unit, e.g. 'Unit 01: Hiragana Basics & Greetings'")
    focus_summary: str = Field(description="Summary of concepts, phonetics, and grammar covered")
    study_cards: List[StudyCard] = Field(description="Complete study cards extracted from class notes")
    exercises: List[Exercise] = Field(description="15 progressive interactive exercises spanning all 6 types")

# --- Deterministic Kana Catalog ---
KANA_ROWS_CATALOG = {
    "a": [
        ("あ", "a", "अ", "Think of an open mouth saying अ; follow the curved and crossing strokes carefully."),
        ("い", "i", "इ", "Two simple strokes; keep the second stroke distinct."),
        ("う", "u", "उ", "A compact shape; avoid turning it into a long 'ऊ'."),
        ("え", "e", "ए", "Notice the top short stroke and the flowing lower shape."),
        ("お", "o", "ओ", "Keep the small extra stroke distinct from あ."),
    ],
    "ka": [
        ("か", "ka", "क", "Unaspirated क; do not add the strong breath of ख."),
        ("き", "ki", "कि", "Horizontal strokes and curved lower part; write in correct order."),
        ("く", "ku", "कु", "One open angle, like a small beak."),
        ("け", "ke", "के", "Three strokes; vertical line and right-side curve clear."),
        ("こ", "ko", "को", "Two horizontal strokes; balanced and distinct."),
    ],
    "sa": [
        ("さ", "sa", "स", "Three strokes; notice the open curved shape and finishing stroke."),
        ("し", "shi", "शि", "One smooth curved stroke; 'shi' not 'si'."),
        ("す", "su", "सु", "Two strokes; keep the central loop clear."),
        ("せ", "se", "से", "Three strokes; keep the crossing strokes distinct."),
        ("そ", "so", "सो", "One curved form; practise its direction slowly."),
    ],
    "ta": [
        ("た", "ta", "त", "Four strokes; keep the short strokes separate from the main form."),
        ("ち", "chi", "चि", "Two strokes; 'chi' not 'ti'."),
        ("つ", "tsu", "त्सु", "One curved stroke; 'tsu' not 'tu'; do not confuse with し."),
        ("て", "te", "ते", "One flowing stroke; keep the bend open."),
        ("と", "to", "तो", "Two strokes; short mark sits above the curved stroke."),
    ],
    "na": [
        ("な", "na", "न", "Four strokes; write the crossing and curved parts carefully."),
        ("に", "ni", "नि", "Three strokes; keep the horizontal lines distinct."),
        ("ぬ", "nu", "नु", "Two strokes; remember the loop at the end."),
        ("ね", "ne", "ने", "Two strokes; notice the loop and finishing curve."),
        ("の", "no", "नो", "One curved stroke; a simple rounded loop."),
    ],
    "ha": [
        ("は", "ha", "ह", "Three strokes; vertical line and loop on right."),
        ("ひ", "hi", "हि", "One continuous curved stroke."),
        ("ふ", "fu", "फु", "Four strokes; soft bilabial 'fu'."),
        ("へ", "he", "हे", "One diagonal mountain stroke."),
        ("ほ", "ho", "हो", "Four strokes; similar to は but with an upper bar."),
    ],
    "ma": [
        ("ま", "ma", "म", "Three strokes; crossbars and loop."),
        ("み", "mi", "मि", "Two strokes; flowing loop."),
        ("む", "mu", "मु", "Three strokes; loop and right dot."),
        ("め", "me", "मे", "Two strokes; loops across."),
        ("も", "mo", "मो", "Three strokes; vertical hook and crossbars."),
    ],
    "ya": [
        ("や", "ya", "य", "Three strokes; open curve."),
        ("ゆ", "yu", "यु", "Two strokes; loop and vertical line."),
        ("よ", "yo", "यो", "Two strokes; horizontal and looped vertical."),
    ],
    "ra": [
        ("ら", "ra", "र", "Two strokes; top dash and curve."),
        ("り", "ri", "रि", "Two vertical strokes; second longer."),
        ("る", "ru", "रु", "One stroke with bottom loop."),
        ("れ", "re", "रे", "Two strokes; similar to ね but kicks out."),
        ("ろ", "ro", "रो", "One stroke; like る but without the loop."),
    ],
    "wa": [
        ("わ", "wa", "व", "Two strokes; vertical and rounded curve."),
        ("を", "wo", "वो", "Three strokes; grammatical particle 'o'/'wo'."),
        ("ん", "n", "न्", "One stroke; nasal mora 'n'."),
    ],
}

def extract_deterministic_kana(raw_markdown: str) -> List[StudyCard]:
    """
    Deterministically captures taught Kana characters from markdown tables and row headers
    using regex, guaranteeing basic rows (あ, か, さ, た, な, etc.) can never be skipped by LLM.
    """
    cards: Dict[str, StudyCard] = {}

    # 1. Look for markdown table rows where a cell is a single Kana character
    for line in raw_markdown.split("\n"):
        if "|" in line:
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if len(parts) >= 2:
                for idx, p in enumerate(parts):
                    if re.fullmatch(r"[\u3040-\u309F\u30A0-\u30FF]", p):
                        romaji = parts[0] if idx != 0 else (parts[1] if len(parts) > 1 else "")
                        marathi = parts[2] if len(parts) > 2 else ""
                        tip = parts[3] if len(parts) > 3 else ""
                        md5_hash = hashlib.md5(p.encode("utf-8")).hexdigest()
                        cards[p] = StudyCard(
                            japanese=p,
                            kana_only=p,
                            romaji=romaji,
                            english=f"Hiragana '{p}' ({romaji})",
                            marathi=f"मराठी उच्चार: {marathi}" if marathi else f"उच्चार: {romaji}",
                            pronunciation_tip=tip or f"Practice writing and pronouncing '{p}' ({romaji}).",
                            svg_keyword="alphabet",
                            item_type="KANA",
                            audio_path=f"/static/audio/{md5_hash}.mp3",
                        )

    # 2. Check row headers (e.g. 'あ-row', 'か-row', 'K-row', 'a-row', 'あ行')
    for row_name, row_chars in KANA_ROWS_CATALOG.items():
        first_char = row_chars[0][0]
        patterns = [
            rf"\b{row_name}[- ]row\b",
            rf"\b{row_name[0]}[- ]row\b" if len(row_name) > 1 and row_name[0] in ["k", "s", "t", "n", "h", "m", "y", "r", "w"] else None,
            rf"{first_char}[- ]row",
            rf"{first_char}行",
        ]
        patterns = [p for p in patterns if p]

        row_matched = False
        for pat in patterns:
            if re.search(pat, raw_markdown, re.IGNORECASE):
                row_matched = True
                break

        if row_matched:
            for char, rom, mar, tip in row_chars:
                if char not in cards:
                    md5_hash = hashlib.md5(char.encode("utf-8")).hexdigest()
                    cards[char] = StudyCard(
                        japanese=char,
                        kana_only=char,
                        romaji=rom,
                        english=f"Hiragana '{char}' ({rom})",
                        marathi=f"मराठी उच्चार: {mar}, '{rom}' आवाज",
                        pronunciation_tip=tip,
                        svg_keyword="alphabet",
                        item_type="KANA",
                        audio_path=f"/static/audio/{md5_hash}.mp3",
                    )

    return list(cards.values())

def chunk_markdown_by_headings(raw_markdown: str, max_chunk_chars: int = 4000) -> List[str]:
    """Splits raw markdown into manageable chunks along top-level section headings."""
    if len(raw_markdown) <= max_chunk_chars:
        return [raw_markdown]

    sections = re.split(r'\n(?=#{1,2}\s+)', raw_markdown)
    chunks = []
    current_chunk = []
    current_len = 0
    for sec in sections:
        sec_len = len(sec)
        if current_chunk and (current_len + sec_len > max_chunk_chars):
            chunks.append('\n'.join(current_chunk))
            current_chunk = [sec]
            current_len = sec_len
        else:
            current_chunk.append(sec)
            current_len += sec_len
    if current_chunk:
        chunks.append('\n'.join(current_chunk))
    return chunks

class CurriculumAgent:
    FALLBACK_MODELS = [
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
        "gemini-3.5-flash",
    ]

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required.")
        from google import genai
        self.client = genai.Client(api_key=self.api_key)

    def _call_model(
        self,
        contents: str,
        system_instruction: str,
        response_schema: Any,
        temperature: float = 0.0,
        max_tokens: int = 8192
    ) -> Any:
        from google.genai import types
        last_error = None
        for model in self.FALLBACK_MODELS:
            try:
                resp = self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_schema=response_schema,
                        temperature=temperature,
                        max_output_tokens=max_tokens,
                    ),
                )
                if resp.text:
                    return response_schema.model_validate_json(resp.text)
            except Exception as e:
                err_str = str(e)
                print(f"⚠️ Model '{model}' error: {err_str[:120]}... Trying next model.")
                last_error = e
                continue

        raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")

    def generate_unit(
        self,
        unit_number: int,
        raw_markdown: str,
        due_items: Optional[List[Dict[str, Any]]] = None
    ) -> DailyUnit:
        """
        Parses raw class notes and synthesizes an exhaustive structured DailyUnit.
        Uses deterministic Kana detection, section-based chunking, temperature=0.0 extraction,
        and weaves past due items into interactive drills.
        """
        # 1. Deterministic Kana detection
        deterministic_kana = extract_deterministic_kana(raw_markdown)
        print(f"🔤 Deterministically detected {len(deterministic_kana)} Kana characters for Unit {unit_number:02d}.")

        # 2. Chunk markdown and perform exhaustive extraction
        chunks = chunk_markdown_by_headings(raw_markdown, max_chunk_chars=4000)
        print(f"📄 Markdown size: {len(raw_markdown)} chars -> {len(chunks)} chunk(s) for extraction.")

        extracted_cards: Dict[str, StudyCard] = {}

        card_instruction = (
            "You are an expert Japanese Sensei curriculum architect. "
            "EXHAUSTIVE EXTRACTION ONLY. Extract EVERY SINGLE vocabulary word, phrase, greeting, "
            "number/time pattern, grammar structure, and Marathi phonetic trap from the notes. "
            "Do NOT summarize, sample, or omit basic/early items. "
            "Preserve exact Marathi explanations, nuances, and pronunciation tips from the class notes. "
            "Assign each card an appropriate item_type ('KANA', 'VOCAB', 'GRAMMAR', 'PHRASE')."
        )

        for i, chunk in enumerate(chunks, start=1):
            if len(chunk.strip()) < 50:
                continue
            prompt = f"Extract all study cards exhaustively from this section of Unit {unit_number:02d} class notes:\n\n{chunk}"
            try:
                chunk_res = self._call_model(
                    contents=prompt,
                    system_instruction=card_instruction,
                    response_schema=ExtractedCards,
                    temperature=0.0,
                    max_tokens=8192,
                )
                for card in chunk_res.study_cards:
                    key = card.japanese.strip()
                    if key:
                        extracted_cards[key] = card
                print(f"  -> Chunk {i}/{len(chunks)}: extracted {len(chunk_res.study_cards)} cards.")
            except Exception as e:
                print(f"⚠️ Failed extracting cards from chunk {i}: {e}")

        # 3. Merge deterministic Kana into cards
        for kana_card in deterministic_kana:
            key = kana_card.japanese.strip()
            if key not in extracted_cards:
                extracted_cards[key] = kana_card
            else:
                existing = extracted_cards[key]
                existing.item_type = "KANA"
                existing.kana_only = kana_card.kana_only
                if not existing.romaji:
                    existing.romaji = kana_card.romaji
                if not existing.marathi:
                    existing.marathi = kana_card.marathi

        all_cards = list(extracted_cards.values())
        print(f"📚 Total merged exhaustive study cards for Unit {unit_number:02d}: {len(all_cards)}.")

        # 4. Generate progressive exercises & summary based on exhaustive cards
        revision_context = ""
        if due_items and len(due_items) > 0:
            formatted_due = []
            for item in due_items:
                formatted_due.append(
                    f"- {item.get('japanese')} ({item.get('kana_only', '')}): {item.get('english')} | Tip: {item.get('pronunciation_tip', '')}"
                )
            revision_context = (
                "\n### 🔄 CROSS-UNIT REVISION ITEMS (DUE FROM EARLIER UNITS):\n"
                + "\n".join(formatted_due)
                + "\nCRITICAL RULE: You MUST weave 3 to 4 exercises testing these exact past items. "
                "Set `is_revision_item: true` on those specific drills!\n"
            )

        cards_summary = "\n".join([
            f"- {c.japanese} ({c.kana_only or c.romaji}): {c.english} | Marathi: {c.marathi} | Tip: {c.pronunciation_tip}"
            for c in all_cards[:60]
        ])

        exercise_instruction = (
            "You are an expert Japanese Sensei curriculum architect. "
            "You are creating a comprehensive, high-engagement curriculum unit strictly based on real class notes.\n\n"
            "MANDATORY REQUIREMENTS:\n"
            "1. EXERCISES: Generate exactly 15 progressive exercises covering all 6 interactive types:\n"
            "   - AUDIO_TO_MEANING: User listens to Japanese audio and picks meaning/reading.\n"
            "   - PRONUNCIATION_TRAP: Directly tests subtle class phonetic traps (unaspirated sounds, wa vs ha, long vowels, 4:00/よじ, 9:00/くじ).\n"
            "   - POLITENESS_RANK: User ranks phrases from casual to formal (options = shuffled phrases, correct_answer = ordered CSV or arrow list).\n"
            "   - SITUATIONAL_CHOICE: Multiple choice for real-life Japanese situations (leaving home vs returning, mealtime, bowing depth).\n"
            "   - TILE_BUILDER: Arrange scrambled word tiles into a correct sentence (options = scrambled tiles, correct_answer = full Japanese sentence).\n"
            "   - SPEAKING_CHECK: Pronunciation test for browser Web Speech API ja-JP (target_phrase = sentence to speak, prompt = what to say).\n"
            "2. If cross-unit revision items are provided, 3-4 exercises MUST test them with `is_revision_item: true`.\n"
            "3. JAPANESE SCRIPT REQUIREMENT: Whenever an exercise asks for a Japanese word, phrase, or sentence, ALL options MUST be written in Japanese script (Hiragana, Katakana, or Kanji with Kana)—NEVER Romaji-only.\n"
            "4. Return strictly valid structured data matching the ExercisesAndSummary schema."
        )

        overview_text = raw_markdown[:2000]
        exercise_prompt = (
            f"Generate title, focus summary, and 15 progressive interactive exercises for Unit {unit_number:02d}.\n\n"
            f"### UNIT NOTES OVERVIEW:\n{overview_text}\n\n"
            f"### EXTRACTED VOCABULARY & KANA CARDS FOR THIS UNIT:\n{cards_summary}\n\n"
            f"{revision_context}"
        )

        ex_res = self._call_model(
            contents=exercise_prompt,
            system_instruction=exercise_instruction,
            response_schema=ExercisesAndSummary,
            temperature=0.0,
            max_tokens=8192,
        )

        return DailyUnit(
            unit_number=unit_number,
            unit_title=ex_res.unit_title,
            focus_summary=ex_res.focus_summary,
            study_cards=all_cards,
            exercises=ex_res.exercises,
        )

if __name__ == "__main__":
    from db.database import get_notion_sync
    # Quick dry run check
    class1 = get_notion_sync("41d1f226830e81c681d0fe628ee1319c")
    if class1:
        agent = CurriculumAgent()
        print("Testing CurriculumAgent on Class 01...")
        unit = agent.generate_unit(1, class1["raw_markdown"])
        print("Generated Unit Title:", unit.unit_title)
        print("Cards:", len(unit.study_cards), "Exercises:", len(unit.exercises))

