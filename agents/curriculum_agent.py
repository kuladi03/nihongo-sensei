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

class DailyUnit(BaseModel):
    unit_number: int = Field(description="1-based unit sequence number")
    unit_title: str = Field(description="Title of unit, e.g. 'Unit 01: Hiragana Basics & Greetings'")
    focus_summary: str = Field(description="Summary of concepts, phonetics, and grammar covered")
    study_cards: List[StudyCard] = Field(description="Complete study cards extracted from class notes")
    exercises: List[Exercise] = Field(description="15 progressive interactive exercises spanning all 6 types")

class CurriculumAgent:
    FALLBACK_MODELS = [
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash",
        "gemini-3.8-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
    ]

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required.")
        from google import genai
        self.client = genai.Client(api_key=self.api_key)

    def generate_unit(
        self,
        unit_number: int,
        raw_markdown: str,
        due_items: Optional[List[Dict[str, Any]]] = None
    ) -> DailyUnit:
        """
        Parses raw class notes and synthesizes a structured DailyUnit JSON.
        Weaves due_items from past units into exercises with is_revision_item=True.
        """
        from google.genai import types

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

        system_instruction = (
            "You are an expert Japanese Sensei curriculum architect. "
            "Your student learns Japanese with Marathi & English phonetic context. "
            "You are creating a comprehensive, high-engagement curriculum unit strictly based on real class notes.\n\n"
            "MANDATORY REQUIREMENTS:\n"
            "1. STUDY CARDS: Extract EVERY single Kana, vocabulary word, grammar pattern, greeting, number/time pattern, "
            "and etiquette rule from the notes. Preserve exact Marathi explanations (e.g. unaspirated 'क' vs 'ख', は as wa, "
            "bowing angles 15°/30°/45°, dash read as 'の'). Set a concise English svg_keyword for each card (e.g. 'bowing', 'coffee', 'clock', 'desk').\n"
            "2. EXERCISES: Generate exactly 15 progressive exercises covering all 6 interactive types:\n"
            "   - AUDIO_TO_MEANING: User listens to Japanese audio and picks meaning/reading.\n"
            "   - PRONUNCIATION_TRAP: Directly tests subtle class phonetic traps (unaspirated sounds, wa vs ha, long vowels, 4:00/よじ, 9:00/くじ).\n"
            "   - POLITENESS_RANK: User ranks phrases from casual to formal (options = shuffled phrases, correct_answer = ordered CSV or arrow list).\n"
            "   - SITUATIONAL_CHOICE: Multiple choice for real-life Japanese situations (leaving home vs returning, mealtime, bowing depth).\n"
            "   - TILE_BUILDER: Arrange scrambled word tiles into a correct sentence (options = scrambled tiles, correct_answer = full Japanese sentence).\n"
            "   - SPEAKING_CHECK: Pronunciation test for browser Web Speech API ja-JP (target_phrase = sentence to speak, prompt = what to say).\n"
            "3. If cross-unit revision items are provided, 3-4 exercises MUST test them with `is_revision_item: true`.\n"
            "4. JAPANESE SCRIPT REQUIREMENT: Whenever an exercise asks for a Japanese word, phrase, or sentence, ALL options MUST be written in Japanese script (Hiragana, Katakana, or Kanji with Kana)—NEVER Romaji-only.\n"
            "5. Return strictly valid structured data matching the DailyUnit schema."
        )

        user_prompt = (
            f"Generate DailyUnit for Unit {unit_number:02d}.\n\n"
            f"### CLASS NOTES:\n{raw_markdown}\n\n"
            f"{revision_context}"
        )

        last_error = None
        for model in self.FALLBACK_MODELS:
            print(f"🤖 Attempting generation with model: '{model}'...")
            try:
                # First try with structured schema
                resp = self.client.models.generate_content(
                    model=model,
                    contents=user_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_schema=DailyUnit,
                        temperature=0.2,
                    ),
                )
                if resp.text:
                    unit_obj = DailyUnit.model_validate_json(resp.text)
                    print(f"🎉 Successfully generated Unit {unit_number} using {model}!")
                    return unit_obj
            except Exception as e:
                err_str = str(e)
                print(f"⚠️ Model '{model}' error: {err_str[:120]}...")
                last_error = e
                # Fallback within model: try without response_schema, just json mime type
                try:
                    resp = self.client.models.generate_content(
                        model=model,
                        contents=user_prompt + "\n\nOutput only valid JSON conforming to the DailyUnit schema.",
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            response_mime_type="application/json",
                            temperature=0.2,
                        ),
                    )
                    if resp.text:
                        unit_obj = DailyUnit.model_validate_json(resp.text)
                        print(f"🎉 Successfully generated Unit {unit_number} using {model} (JSON fallback)!")
                        return unit_obj
                except Exception as inner_e:
                    last_error = inner_e
                    continue

        raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")

if __name__ == "__main__":
    from db.database import get_notion_sync
    # Quick dry run check
    class1 = get_notion_sync("41d1f226830e81c681d0fe628ee1319c")
    if class1:
        agent = CurriculumAgent()
        print("Testing CurriculumAgent on Class 01...")
        unit = agent.generate_unit(1, class1["raw_markdown"][:1000])
        print("Generated Unit Title:", unit.unit_title)
        print("Cards:", len(unit.study_cards), "Exercises:", len(unit.exercises))
