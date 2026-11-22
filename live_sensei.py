#!/usr/bin/env python3
"""
Nihongo Sensei — Live Sensei WebSocket Engine (Phase 6)
Provides real-time multimodal voice conversation with Sensei powered by Gemini Live API.
Features:
- Seamless Best -> Good Model Waterfall (gemini-3.8-live -> gemini-3.1-flash-live-preview -> gemini-2.5-flash-native-audio-latest)
- In-Memory Per-Connection Session State (15-turn transcript history + whiteboard cards buffer)
- Seamless Mid-Call Handoff on 429 / RESOURCE_EXHAUSTED / Disconnect (reconnects with conversation context without dropping browser WebSocket)
- Context Window Compression (sliding window) to stay within TPM limits
- Per-User JWT Auth & Curriculum Scoping from SQLite (user_unit_progress & mastery_items)
- Interactive Whiteboard Tool (push_whiteboard_card)
"""
import os
import sys
import json
import base64
import asyncio
import logging
import traceback
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from typing import Optional, Dict, Any, List

import websockets
from google import genai
from google.genai import types
from google.genai.errors import APIError

# Ensure root directory is in sys.path
ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

from agents.notion_agent import ensure_env_loaded
from auth import decode_access_token
from db.database import (
    get_user_by_id,
    get_user_roadmap,
    get_user_bank_items,
    get_user_due_mastery_items,
    save_live_session,
    update_live_session_summary,
    get_user_recent_live_session_summaries,
    init_database,
)

ensure_env_loaded()
init_database()

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [LiveSensei] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("LiveSensei")

# Port for Live Sensei WebSocket server
WS_PORT = int(os.environ.get("LIVE_WS_PORT", 8001))

# Model Waterfall Priority List (Best -> Good)
# Exact models verified via client.models.list() on v1alpha
LIVE_MODEL_WATERFALL = [
    "gemini-3.8-live",
    "gemini-3.1-flash-live-preview",        # mapped alias for gemini-3-flash-live
    "gemini-2.5-flash-native-audio-latest", # mapped alias for gemini-2.5-flash-native-audio-dialog
]

MODEL_DISPLAY_NAMES = {
    "gemini-3.8-live": "gemini-3.8-live",
    "gemini-3.1-flash-live-preview": "gemini-3-flash-live",
    "gemini-2.5-flash-native-audio-latest": "gemini-2.5-flash-native-audio-dialog",
}

JLPT_N5_SCENARIOS = [
    {
        "title": "Ordering at a Café (カフェでの注文)",
        "context": "The student is at a Japanese café ordering drinks and food.",
        "items": [
            {"japanese": "すみません、アイスコーヒーを一つください。", "romaji": "Sumimasen, aisu koohii o hitotsu kudasai.", "english": "Excuse me, one iced coffee please.", "tip": "Use 〜を一つ (o hitotsu) for ordering one item."},
            {"japanese": "テイクアウトでお願いします。", "romaji": "Teikuauto de onegaishimasu.", "english": "Takeout please / To go, please.", "tip": "Use 店内で (tennai de) if dining in."},
            {"japanese": "いくらですか。", "romaji": "Ikura desu ka.", "english": "How much is it?", "tip": "Standard price question in Japanese."},
            {"japanese": "カードで払えますか。", "romaji": "Kaado de haraemasu ka.", "english": "Can I pay with a card?", "tip": "〜で払えますか = Can I pay with ~?"},
            {"japanese": "ごちそうさまでした！", "romaji": "Gochisousama deshita!", "english": "Thank you for the meal / food!", "tip": "Polite phrase said when finishing eating or leaving a café."},
        ]
    },
    {
        "title": "Train Station & Directions (駅と道案内)",
        "context": "The student is navigating a Tokyo train station or asking for street directions.",
        "items": [
            {"japanese": "東京駅はどこですか。", "romaji": "Toukyou eki wa doko desu ka.", "english": "Where is Tokyo Station?", "tip": "〜はどこですか = Where is ~?"},
            {"japanese": "この電車は新宿に行きますか。", "romaji": "Kono densha wa Shinjuku ni ikimasu ka.", "english": "Does this train go to Shinjuku?", "tip": "〜に行きますか = Does it go to ~?"},
            {"japanese": "何番線ですか。", "romaji": "Nanban-sen desu ka.", "english": "Which track / platform number is it?", "tip": "番線 (bansen) = platform track number."},
            {"japanese": "まっすぐ行って、右に曲がってください。", "romaji": "Massugu itte, migi ni magatte kudasai.", "english": "Go straight and turn right.", "tip": "まっすぐ = straight, 右 = right, 左 = left."},
            {"japanese": "歩いて五分くらいです。", "romaji": "Aruite gofun kurai desu.", "english": "It is about a 5-minute walk.", "tip": "歩いて (aruite) = by walking, くらい = about."},
        ]
    },
    {
        "title": "Convenience Store & Shopping (コンビニとお買い物)",
        "context": "The student is buying items at a convenience store or market.",
        "items": [
            {"japanese": "袋はいりません。", "romaji": "Fukuro wa irimasen.", "english": "I do not need a plastic bag.", "tip": "袋 (fukuro) = bag. いりません = don't need."},
            {"japanese": "温めますか。", "romaji": "Atatamemasu ka.", "english": "Would you like this heated up / microwaved?", "tip": "Common cashier question for bento: reply 'はい、お願いします' (Yes please)."},
            {"japanese": "お箸を一つつけてください。", "romaji": "Ohashi o hitotsu tsukete kudasai.", "english": "Please include one pair of chopsticks.", "tip": "お箸 (ohashi) = chopsticks."},
            {"japanese": "レシートは大丈夫です。", "romaji": "Reshiito wa daijoubu desu.", "english": "No receipt needed, thanks.", "tip": "大丈夫です = It's okay / no thanks."},
            {"japanese": "おすすめは何ですか。", "romaji": "Osusume wa nan desu ka.", "english": "What do you recommend?", "tip": "おすすめ (osusume) = recommendation."},
        ]
    },
    {
        "title": "Daily Routine & Weekend Plans (日常会話とお誘い)",
        "context": "Chatting about weekend plans, invitations, and meeting friends.",
        "items": [
            {"japanese": "今週末、何をしますか。", "romaji": "Konshuumatsu, nani o shimasu ka.", "english": "What are you doing this weekend?", "tip": "今週末 (konshuumatsu) = this weekend."},
            {"japanese": "いっしょにお昼ご飯を食べませんか。", "romaji": "Issho ni ohirugohan o tabemasen ka.", "english": "Would you like to have lunch together?", "tip": "〜ませんか is a polite invitation ('Won't you ~?')."},
            {"japanese": "いいですね！行きましょう。", "romaji": "Ii desu ne! Ikimashou.", "english": "Sounds great! Let's go.", "tip": "〜ましょう expresses enthusiastic agreement."},
            {"japanese": "何時に会いましょうか。", "romaji": "Nanji ni aimashou ka.", "english": "What time shall we meet?", "tip": "何時 (nanji) = what time."},
            {"japanese": "楽しみにしています！", "romaji": "Tanoshimi ni shite imasu!", "english": "I am really looking forward to it!", "tip": "Classic polite closing when planning an outing."},
        ]
    },
    {
        "title": "Asking for Help & Clarification (困った時の日本語)",
        "context": "Essential survival phrases when in Japan needing clarification or help.",
        "items": [
            {"japanese": "日本語がまだ上手ではありません。", "romaji": "Nihongo ga mada jouzu dewa arimasen.", "english": "My Japanese is not very good yet.", "tip": "Modest and practical way to set expectations."},
            {"japanese": "もう一度ゆっくり言ってください。", "romaji": "Mou ichido yukkuri itte kudasai.", "english": "Please say it once more slowly.", "tip": "もう一度 (mou ichido) = once more, ゆっくり (yukkuri) = slowly."},
            {"japanese": "これは日本語で何と言いますか。", "romaji": "Kore wa nihongo de nan to iimasu ka.", "english": "How do you say this in Japanese?", "tip": "Essential phrase for asking Japanese equivalents."},
            {"japanese": "書いてもらえますか。", "romaji": "Kaite moraemasu ka.", "english": "Could you write it down for me?", "tip": "Helpful when unfamiliar with kanji or fast speech."},
            {"japanese": "助かりました。ありがとうございます！", "romaji": "Tasukarimashita. Arigatou gozaimasu!", "english": "That was a lifesaver. Thank you so much!", "tip": "助かりました = 'You really helped me out / That saved me.'"},
        ]
    }
]

class SessionState:
    """Maintains per-connection conversation history, whiteboard cards, and dynamic curriculum."""
    def __init__(self, user: Dict[str, Any], base_prompt: str, initial_items: Optional[List[str]] = None):
        self.user = user
        self.base_prompt = base_prompt
        self.session_history: List[Dict[str, str]] = []  # last 15 turns: [{"role": "user"|"sensei", "text": str}]
        self.whiteboard_cards: List[Dict[str, str]] = [] # [{"japanese": ..., "romaji": ..., "english": ..., "tip": ...}]
        self.covered_items: set = set(initial_items or [])
        self.scenario_idx: int = 0
        self.current_model_idx: int = 0
        self.session_active: bool = True
        self.user_turns: int = 0

    def add_transcript(self, role: str, text: str):
        t = text.strip()
        if not t:
            return
        if role == "user":
            self.user_turns += 1
        if self.session_history and self.session_history[-1]["role"] == role:
            self.session_history[-1]["text"] += " " + t
        else:
            self.session_history.append({"role": role, "text": t})
        if len(self.session_history) > 15:
            self.session_history = self.session_history[-15:]

    def add_whiteboard_card(self, card: Dict[str, str]) -> bool:
        jp = (card.get("japanese") or "").strip()
        if not jp:
            return False
        for c in self.whiteboard_cards:
            if c.get("japanese", "").strip() == jp:
                return False
        self.whiteboard_cards.append(card)
        return True

    def get_next_batch(self) -> Dict[str, Any]:
        """Fetches the next 5 unseen items from mastery_items or overflows to JLPT N5 survival scenarios."""
        user_id = self.user.get("id")
        bank_items = get_user_bank_items(user_id) if user_id else []
        generic_greetings = {"こんにちは", "おはよう", "ありがとう", "こんばんは", "さようなら", "じゃあね", "バイバイ"}

        unseen = [
            i for i in bank_items
            if (i.get("item_type") or "").upper() != "KANA"
            and i.get("japanese", "").strip() not in self.covered_items
            and i.get("japanese", "").strip() not in generic_greetings
        ]

        if len(unseen) >= 3:
            picked = unseen[:5]
            for it in picked:
                self.covered_items.add(it.get("japanese", "").strip())
            return {
                "source": "curriculum_syllabus",
                "unit": picked[0].get("unit_title", "Current Syllabus"),
                "instruction": (
                    "ROLEPLAY DIRECTIVE: Frame a relatable 1-sentence real-life scenario fitting these words (e.g. at a Tokyo café, convenience store, office, or meeting a friend). "
                    "Act as the conversation partner, introduce 1 word at a time on the whiteboard, and prompt the student to reply in character. "
                    "Keep turns short (1–3 sentences), vary reactions naturally, and never announce step numbers."
                ),
                "items": [
                    {
                        "japanese": it.get("japanese"),
                        "romaji": it.get("romaji"),
                        "english": it.get("english"),
                        "tip": it.get("pronunciation_tip") or it.get("marathi") or "",
                    }
                    for it in picked
                ]
            }

        # Overflow to curated JLPT N5 Survival Scenarios
        scenario = JLPT_N5_SCENARIOS[self.scenario_idx % len(JLPT_N5_SCENARIOS)]
        self.scenario_idx += 1
        for it in scenario["items"]:
            self.covered_items.add(it["japanese"].strip())

        return {
            "source": "jlpt_n5_survival_scenario",
            "scenario_title": scenario["title"],
            "context": scenario["context"],
            "instruction": (
                f"ROLEPLAY DIRECTIVE: Transition seamlessly into this real-world roleplay scenario: '{scenario['title']}'. "
                f"Act as the conversation partner ({scenario.get('context', 'partner')}), introduce 1 phrase at a time on the whiteboard, and prompt the student to reply in character. "
                "Keep turns short (1–3 sentences) and vary reactions naturally."
            ),
            "items": scenario["items"]
        }

    def build_system_instruction(self) -> str:
        """Appends CONVERSATION SO FAR block on failover reconnects."""
        if not self.session_history and not self.whiteboard_cards:
            return self.base_prompt

        turns_lines = []
        for turn in self.session_history[-10:]:
            turns_lines.append(f"- {turn['role'].capitalize()}: {turn['text']}")
        turns_str = "\n".join(turns_lines) if turns_lines else "None yet"

        cards_lines = []
        for c in self.whiteboard_cards[-8:]:
            cards_lines.append(f"- {c.get('japanese')} ({c.get('romaji')}: {c.get('english')})")
        cards_str = "\n".join(cards_lines) if cards_lines else "None yet"

        handoff_block = f"""
============================================================
--- CONVERSATION SO FAR (SESSION RESTORATION CONTEXT) ---
Recent conversation dialogue with student:
{turns_str}

Whiteboard cards already presented on screen:
{cards_str}

CRITICAL HANDOFF INSTRUCTION:
You are continuing this ongoing lesson after a seamless technical model switch.
Do NOT re-introduce yourself, do NOT greet the student anew (e.g., do not say "Hello, I am Sensei"), and do NOT restart the lesson from the beginning.
Continue the conversation naturally, warmly, and directly from the last turn above.
============================================================
"""
        return f"{self.base_prompt.strip()}\n\n{handoff_block.strip()}"


FALLBACK_TEXT_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-1.5-flash",
]


async def generate_session_recap_async(
    session_id: int,
    transcript: List[Dict[str, str]],
    whiteboard_cards: List[Dict[str, str]],
    user_name: str,
    unit_focus: str,
    api_key: str,
):
    """Generates structured AI recap via fast text models and updates live_sessions."""
    try:
        dialogue_lines = []
        for t in transcript:
            role_label = "Student" if t.get("role") == "user" else "Nihongo Sensei"
            dialogue_lines.append(f"{role_label}: {t.get('text', '')}")
        dialogue_str = "\n".join(dialogue_lines)

        cards_str = ", ".join([f"{c.get('japanese')} ({c.get('romaji')}: {c.get('english')})" for c in whiteboard_cards]) if whiteboard_cards else "None"

        prompt = f"""You are analyzing a 1-on-1 spoken Japanese lesson between Nihongo Sensei and student {user_name}.
Unit Focus: {unit_focus}

Whiteboard Cards displayed:
{cards_str}

Conversation Transcript:
{dialogue_str}

Please generate a concise JSON recap summarizing what was practiced.
CRITICAL INSTRUCTION: Explicitly IGNORE any off-topic ambient noise, accidental chatter, or non-Japanese noise. Focus strictly on the Japanese language teaching and student practice.

Return a JSON object with this exact schema:
{{
  "topics_covered": ["string: 2 to 4 concise topic bullets (e.g., 'Self-introductions & greetings', 'Pronunciation of wa particle')"],
  "new_phrases": ["string: 2 to 6 key Japanese phrases practiced with English meaning, e.g., 'はじめまして (Nice to meet you)']"],
  "pronunciation_notes": "string: 1 to 2 encouraging, constructive sentences on pronunciation, pitch, or Marathi phonetic comparisons",
  "next_focus": "string: 1 clear actionable sentence recommending what to practice in the next session"
}}
"""
        client = genai.Client(api_key=api_key)
        response_text = None

        for model_name in FALLBACK_TEXT_MODELS:
            try:
                logger.info("Generating AI recap for session %d using %s...", session_id, model_name)
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    lambda m=model_name: client.models.generate_content(
                        model=m,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json"
                        )
                    )
                )
                if response and response.text:
                    response_text = response.text.strip()
                    logger.info("Successfully generated AI recap with %s for session %d", model_name, session_id)
                    break
            except Exception as model_err:
                logger.warning("Recap model %s failed for session %d: %s", model_name, session_id, model_err)

        if not response_text:
            logger.error("All fallback models failed to generate recap for session %d", session_id)
            return

        summary_data = json.loads(response_text)
        clean_summary = {
            "topics_covered": summary_data.get("topics_covered", [unit_focus]),
            "new_phrases": summary_data.get("new_phrases", []),
            "pronunciation_notes": summary_data.get("pronunciation_notes", "Great practice session! Keep refining pronunciation and pitch."),
            "next_focus": summary_data.get("next_focus", "Continue practicing daily conversational exchanges and numbers.")
        }
        update_live_session_summary(session_id, json.dumps(clean_summary, ensure_ascii=False))
        logger.info("✅ Live session %d AI recap saved successfully!", session_id)
    except Exception as ex:
        logger.error("Error in generate_session_recap_async for session %d: %s", session_id, ex)
        traceback.print_exc()


def build_ordered_lesson_plan(user_id: int) -> tuple[str, str, list[str]]:
    """
    Builds an internal, private 8-item Lesson Queue for the session:
    Items 1–2: Quick review of 2 items from previous sessions/units or due items.
    Items 3–6: 4 distinct items from the user's current/latest synced unit.
    Items 7–8: 2 short 2-turn conversational roleplays using those words.
    Returns (lesson_queue_str, target_unit_title, initial_items).
    """
    roadmap = get_user_roadmap(user_id)
    unlocked = [u for u in roadmap if not u.get("is_locked", False)]
    if not unlocked:
        unlocked = [{"unit_number": 1, "title": "Unit 01: Foundations & Essential Japanese"}]
    target_unit = unlocked[-1]
    target_unit_num = target_unit.get("unit_number", 1)
    target_unit_title = target_unit.get("title", f"Unit {target_unit_num}")

    bank_items = get_user_bank_items(user_id)
    due_items = get_user_due_mastery_items(user_id)

    curr_unit_items = [
        i for i in bank_items
        if i.get("unit_number") == target_unit_num and (i.get("item_type") or "").upper() != "KANA"
    ]
    earlier_unit_items = [
        i for i in bank_items
        if i.get("unit_number", 999) < target_unit_num and (i.get("item_type") or "").upper() != "KANA"
    ]

    # Review items
    review_pool = [d for d in due_items if (d.get("item_type") or "").upper() != "KANA"]
    if not review_pool:
        review_pool = earlier_unit_items if earlier_unit_items else curr_unit_items[:2]

    rev_1 = review_pool[0] if len(review_pool) > 0 else {"japanese": "おはようございます", "romaji": "Ohayou gozaimasu", "english": "Good morning"}
    rev_2 = review_pool[1] if len(review_pool) > 1 else {"japanese": "ありがとうございます", "romaji": "Arigatou gozaimasu", "english": "Thank you"}

    # 4 distinct items from current unit
    generic_greetings = {"こんにちは", "おはよう", "ありがとう", "こんばんは", "さようなら", "じゃあね", "バイバイ"}
    substantive_items = [
        i for i in curr_unit_items
        if i.get("japanese", "").strip() not in generic_greetings and i.get("id") not in [rev_1.get("id"), rev_2.get("id")]
    ]
    if len(substantive_items) < 4:
        substantive_items = curr_unit_items

    new_items = substantive_items[:4]
    while len(new_items) < 4:
        new_items.append({"japanese": "はじめまして", "romaji": "Hajimemashite", "english": "Nice to meet you", "marathi": "भेटून आनंद झाला"})

    initial_items = [
        rev_1.get("japanese", "").strip(),
        rev_2.get("japanese", "").strip(),
    ] + [it.get("japanese", "").strip() for it in new_items]
    initial_items = [i for i in initial_items if i]

    queue_lines = [
        f"- Warmup Review 1: '{rev_1.get('japanese')}' ({rev_1.get('romaji')} = {rev_1.get('english')}). Quick conversational greeting or check-in to get the voice warmed up.",
        f"- Warmup Review 2: '{rev_2.get('japanese')}' ({rev_2.get('romaji')} = {rev_2.get('english')}). Flow naturally into this second familiar phrase.",
        f"- Roleplay Scenario Practicum: Frame a 1-sentence real-life scenario using the target words below (e.g. entering a Tokyo café, greeting a coworker, shopping, or asking directions).",
        f"- Target Phrase 1: '{new_items[0].get('japanese')}' ({new_items[0].get('romaji')} = {new_items[0].get('english')}). Call push_whiteboard_card. Use in character, prompt student to reply.",
        f"- Target Phrase 2: '{new_items[1].get('japanese')}' ({new_items[1].get('romaji')} = {new_items[1].get('english')}). Call push_whiteboard_card. Continue the situation, prompt student to reply.",
        f"- Target Phrase 3: '{new_items[2].get('japanese')}' ({new_items[2].get('romaji')} = {new_items[2].get('english')}). Call push_whiteboard_card. Expand the exchange in character.",
        f"- Target Phrase 4: '{new_items[3].get('japanese')}' ({new_items[3].get('romaji')} = {new_items[3].get('english')}). Call push_whiteboard_card. Bring the roleplay scenario to a fun conclusion.",
    ]
    return "\n".join(queue_lines), target_unit_title, initial_items


def build_user_curriculum_prompt(user_id: int) -> tuple[str, str, list[str]]:
    """Pulls user unlocked units, learned kana, vocab, past session memory, and lesson queue."""
    user = get_user_by_id(user_id)
    name = user.get("name", "Student") if user else "Student"

    roadmap = get_user_roadmap(user_id)
    completed_units = [u for u in roadmap if u.get("is_completed", False)]
    unlocked_units = [u for u in roadmap if not u.get("is_locked", False)]

    bank_items = get_user_bank_items(user_id)
    kana_items = [i for i in bank_items if (i.get("item_type") or "").upper() == "KANA"]
    kana_chars = [k.get("japanese", "").strip() for k in kana_items]
    learned_kana_sample = ", ".join(kana_chars[:25]) if kana_chars else "あ, い, う, え, お, か, き, く, け, こ"

    unlocked_titles = [f"Unit {u['unit_number']}: {u['title']}" for u in unlocked_units]
    unlocked_units_str = ", ".join(unlocked_titles) if unlocked_titles else "Unit 01"

    # 1. Lesson Queue
    lesson_queue_str, target_unit_title, initial_items = build_ordered_lesson_plan(user_id)

    # 2. Cross-Session Memory
    recent_summaries = get_user_recent_live_session_summaries(user_id, limit=3)
    if recent_summaries:
        mem_lines = []
        for s in recent_summaries:
            summ = s.get("summary") or {}
            topics = ", ".join(summ.get("topics_covered", [])) or "Conversation practice"
            phrases = ", ".join(summ.get("new_phrases", [])) or "Key phrases"
            notes = summ.get("pronunciation_notes", "")
            next_f = summ.get("next_focus", "")
            mem_lines.append(f"- Session on {s.get('created_at', '')} (Unit: {s.get('unit_focus', '')}):\n  * Topics: {topics}\n  * Phrases Practiced: {phrases}\n  * Sensei Notes: {notes}\n  * Recommended Next Focus: {next_f}")
        memory_str = "\n".join(mem_lines)
        memory_block = f"""
PREVIOUS LIVE SESSIONS MEMORY:
{memory_str}

CRITICAL MEMORY DIRECTIVE:
The student already completed the sessions listed above. DO NOT re-introduce yourself from scratch and DO NOT re-teach items already mastered unless briefly warming up with the initial review items!
"""
    else:
        memory_block = """
PREVIOUS LIVE SESSIONS MEMORY:
This is the student's first live session! Give a warm, brief welcome and jump directly into the first target item.
"""

    prompt = f"""You are Nihongo Sensei (日本語先生), a warm, encouraging, conversational native-level Japanese tutor for Nihongo Sensei.
You are having an interactive real-time voice lesson with your student, {name}.

STUDENT PROGRESS PROFILE:
- Student Name: {name}
- Current Focus Unit: {target_unit_title}
- Completed Units: {len(completed_units)} / {len(roadmap)}
- Unlocked Units: {unlocked_units_str}
- Learned Hiragana ({len(kana_chars)} / 46 learned): {learned_kana_sample}

{memory_block.strip()}

HIDDEN PRIVATE LESSON QUEUE (INTERNAL CHECKLIST FOR SENSEI ONLY):
{lesson_queue_str}

SITUATION-BASED ROLEPLAY & TEACHING RULES:
1. SCENARIO-FIRST TEACHING:
   Never run a mechanical flashcard viva or repeat-after-me drill. Instead, anchor every set of words in a relatable 1-sentence real-life scenario that fits the target vocabulary (e.g., entering a Tokyo café, greeting a coworker in the office, introducing your family, ordering at an izakaya, or buying a train ticket). Set the scene vividly in 1 sentence!
2. IN-CHARACTER ROLEPLAY LOOP:
   Act as the conversation partner (barista, friend, coworker, station attendant, shopkeeper). Introduce 1 word/phrase at a time on the whiteboard using push_whiteboard_card, explain briefly how it fits the situation, and prompt the student to reply in character (e.g., "いらっしゃいませ！ Welcome to the café! Try asking for green tea: お茶をください (Ocha o kudasai)!").
3. NATURAL, VARIED FEEDBACK (NO ROBOTIC PRAISE):
   NEVER repeat the same robotic opener like "上手ですね！" every single turn. Vary your reactions naturally and genuinely:
   - "いいですね！" (Nice!)
   - "ばっちり！" (Spot on!)
   - "なるほど！" (I see!)
   - "すばらしい！" (Wonderful!)
   - Or simply react in character as your roleplay persona and keep the dialogue flowing!
4. MAX 2 RETRIES (NEVER TRAP IN LOOPS):
   Never trap the student in an endless pronunciation loop. Allow at most 2 gentle retries on a word. If the student is close, or after 2 attempts, offer one quick friendly tip and immediately advance the story/dialogue.
5. HIRAGANA ON WHITEBOARD:
   Whenever calling push_whiteboard_card with Kanji, ALWAYS include the Hiragana reading alongside Romaji (e.g., 携帯 (けいたい)).
6. SHORT & SPOKEN (1–3 SENTENCES MAX):
   Keep Sensei's spoken turns short and conversational (1 to 3 sentences maximum). It must feel like a lively, natural back-and-forth chat with a human friend, not a lecture or textbook reading.
7. SILENT TOOL CALLS (ZERO DOUBLE-SPEAKING):
   Call push_whiteboard_card silently in your tool call. NEVER speak half a sentence before calling the tool and repeat it after the tool response. Speak smoothly in character without repeating phrases.
8. NEVER END A TURN ON PRAISE ALONE:
   Every single turn MUST end with an in-character prompt, roleplay question, or line for the student to speak. Never leave the student stranded.
9. PROACTIVE DRIVER (ENDLESS SESSIONS):
   Lead the class proactively. When current items are practiced, call get_next_lesson_batch() silently in the background to seamlessly flow into the next scenario or vocabulary batch. Never ask "What do you want to learn next?". The student hangs up when they are done.
10. STRICT BILINGUAL SUPPORT & 3-LANGUAGE LOCK:
    The student is a beginner (JLPT N5). Give brief English or Marathi translations for every new Japanese phrase you introduce. You are strictly forbidden from speaking any language other than Japanese, English, or Marathi.
"""
    return prompt, target_unit_title, initial_items


def push_whiteboard_card(japanese: str, romaji: str, english: str, tip: str = "") -> str:
    """Display a Japanese vocabulary, kanji, kana, or grammar card on the student's interactive whiteboard.
    IMPORTANT: Whenever 'japanese' contains Kanji, always include the Hiragana reading alongside Romaji, e.g. '携帯 (けいたい)'."""
    return f"Card for {japanese} ({romaji}) displayed on whiteboard."


def get_next_lesson_batch() -> str:
    """Call silently in the background when the current batch of items is practiced to receive the next 5 fresh words or a conversational roleplay scenario."""
    return "Next lesson batch requested."


class FastAPIWebSocketAdapter:
    """Adapts a FastAPI/Starlette WebSocket to the websockets.ServerConnection interface."""
    def __init__(self, ws):
        self._ws = ws
        self.remote_address = (ws.client.host, ws.client.port) if ws.client else ("127.0.0.1", 0)
        token = ws.query_params.get("token", "")
        self.request = type("MockReq", (), {
            "path": f"/api/live/session?token={token}" if token else "/api/live/session"
        })()

    async def send(self, data: str):
        await self._ws.send_text(data)

    async def recv(self) -> str:
        data = await self._ws.receive_text()
        return data

    def __aiter__(self):
        return self

    async def __anext__(self) -> str:
        try:
            return await self.recv()
        except Exception:
            raise StopAsyncIteration

    async def close(self, code: int = 1000, reason: str = ""):
        try:
            await self._ws.close(code=code, reason=reason)
        except Exception:
            pass

async def handle_live_session(websocket):
    """Handles an individual browser WebSocket connection with full mid-call waterfall failover."""
    if hasattr(websocket, "receive_text") and not hasattr(websocket, "recv"):
        websocket = FastAPIWebSocketAdapter(websocket)

    logger.info("New incoming WebSocket connection from %s", websocket.remote_address)

    # 1. Authenticate user from query parameter or first message
    query_params = parse_qs(urlparse(websocket.request.path).query)
    token = query_params.get("token", [None])[0]

    user = None
    if token:
        payload = decode_access_token(token)
        if payload and payload.get("sub"):
            try:
                user = get_user_by_id(int(payload["sub"]))
            except Exception:
                pass

    if not user:
        # Wait up to 3 seconds for client to send an auth message
        try:
            auth_msg_raw = await asyncio.wait_for(websocket.recv(), timeout=3.0)
            auth_msg = json.loads(auth_msg_raw)
            if auth_msg.get("type") == "auth" and auth_msg.get("token"):
                payload = decode_access_token(auth_msg["token"])
                if payload and payload.get("sub"):
                    user = get_user_by_id(int(payload["sub"]))
        except Exception:
            pass

    if not user:
        logger.warning("Authentication failed for connection %s", websocket.remote_address)
        await websocket.send(json.dumps({
            "type": "error",
            "message": "Authentication required. Please provide a valid Bearer token."
        }))
        await websocket.close(code=4001, reason="Unauthorized")
        return

    logger.info("Authenticated student: %s (ID: %s, Role: %s)", user["name"], user["id"], user["role"])

    # 2. Initialize Session State with user curriculum scoping
    curriculum_prompt, unit_focus, initial_items = build_user_curriculum_prompt(user["id"])
    state = SessionState(user=user, base_prompt=curriculum_prompt, initial_items=initial_items)
    session_start_time = asyncio.get_event_loop().time()
    user_turns_count = [0]

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        await websocket.send(json.dumps({
            "type": "error",
            "message": "GEMINI_API_KEY is not configured on the server."
        }))
        await websocket.close(code=4002, reason="Missing API key")
        return

    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(api_version="v1alpha")
    )

    # 3. Model Waterfall Connection Loop (Seamless Mid-Call Handoff)
    try:
        while state.session_active and state.current_model_idx < len(LIVE_MODEL_WATERFALL):
            active_model = LIVE_MODEL_WATERFALL[state.current_model_idx]
            display_model = MODEL_DISPLAY_NAMES.get(active_model, active_model)
            logger.info("Connecting to Gemini Live with model: %s (Index %d/%d)...",
                        active_model, state.current_model_idx + 1, len(LIVE_MODEL_WATERFALL))

            # Notify frontend about current model
            await websocket.send(json.dumps({
                "type": "model_switched" if state.current_model_idx > 0 else "session_ready",
                "model": display_model,
                "raw_model": active_model,
                "user": {"name": user["name"], "xp": user.get("xp", 0)}
            }))

            # Configure Live Session with Context Window Compression & Transcriptions
            config = types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                context_window_compression=types.ContextWindowCompressionConfig(
                    sliding_window=types.SlidingWindow()
                ),
                output_audio_transcription=types.AudioTranscriptionConfig(),
                input_audio_transcription=types.AudioTranscriptionConfig(),
                tools=[push_whiteboard_card, get_next_lesson_batch],
                system_instruction=state.build_system_instruction()
            )

            try:
                async with client.aio.live.connect(model=active_model, config=config) as live_session:
                    logger.info("Connected to %s! Starting bidirectional audio relay.", active_model)

                    async def client_to_gemini():
                        """Reads audio chunks and text from browser WebSocket and forwards to Gemini Live."""
                        try:
                            async for raw_msg in websocket:
                                if not state.session_active:
                                    break
                                try:
                                    msg = json.loads(raw_msg)
                                except Exception:
                                    continue

                                msg_type = msg.get("type")
                                if msg_type == "audio":
                                    # Incoming PCM16 16kHz audio chunk from browser
                                    pcm_b64 = msg.get("data", "")
                                    if pcm_b64:
                                        pcm_bytes = base64.b64decode(pcm_b64)
                                        await live_session.send_realtime_input(
                                            audio=types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000")
                                        )
                                elif msg_type == "text":
                                    # Fallback typed text message from user
                                    text = (msg.get("text") or "").strip()
                                    if text:
                                        user_turns_count[0] += 1
                                        state.add_transcript("user", text)
                                        await live_session.send_client_content(
                                            turns=[types.Content(role="user", parts=[types.Part.from_text(text=text)])],
                                            turn_complete=True
                                        )
                                elif msg_type == "interrupt":
                                    # User interrupted Sensei speaking
                                    await live_session.send_realtime_input(
                                        activity_start=types.ActivityStart()
                                    )
                                elif msg_type == "ptt_release":
                                    # User released Push-to-Talk: send 300ms zero-PCM silence & audio_stream_end to trigger immediate VAD turn boundary
                                    print("🎙️ [PTT_RELEASE] User released Push-to-Talk. Cueing Gemini Live turn completion...")
                                    try:
                                        silence_bytes = bytes(int(16000 * 2 * 0.3))  # 300ms of zero-PCM at 16kHz
                                        await live_session.send_realtime_input(
                                            audio=types.Blob(data=silence_bytes, mime_type="audio/pcm;rate=16000")
                                        )
                                        await live_session.send_realtime_input(audio_stream_end=True)
                                    except Exception as ptt_err:
                                        print(f"PTT release signal note: {ptt_err}")
                                elif msg_type == "end_call":
                                    state.session_active = False
                                    break
                        except (websockets.ConnectionClosed, asyncio.CancelledError):
                            state.session_active = False
                        except Exception as ex:
                            logger.warning("Exception in client_to_gemini: %s", ex)

                    async def gemini_to_client():
                        """Reads audio chunks, transcriptions, and tool calls from Gemini Live and relays to browser."""
                        try:
                            while state.session_active:
                                turn_audio_chunks = 0
                                turn_sensei_deltas = []
                                turn_user_deltas = []
                                async for response in live_session.receive():
                                    if not state.session_active:
                                        break

                                    # 1. Handle Tool Calls (Interactive Whiteboard & Next Lesson Batch)
                                    if response.tool_call:
                                        try:
                                            responses = []
                                            for fc in response.tool_call.function_calls:
                                                print(f"🔧 [TOOL_CALL] Received from Gemini: {fc.name} (id={fc.id}) args={fc.args}")
                                                if fc.name == "push_whiteboard_card":
                                                    args = fc.args or {}
                                                    card_data = {
                                                        "japanese": str(args.get("japanese", "")),
                                                        "romaji": str(args.get("romaji", "")),
                                                        "english": str(args.get("english", "")),
                                                        "tip": str(args.get("tip", "")),
                                                    }
                                                    state.add_whiteboard_card(card_data)
                                                    await websocket.send(json.dumps({
                                                        "type": "whiteboard_card",
                                                        "card": card_data
                                                    }))
                                                    print(f"🎨 [WHITEBOARD] Dispatched card to browser: {card_data['japanese']} ({card_data['english']})")
                                                    tool_resp = types.FunctionResponse(
                                                        name=fc.name,
                                                        id=fc.id,
                                                        response={"result": "ok"}
                                                    )
                                                    responses.append(tool_resp)
                                                elif fc.name == "get_next_lesson_batch":
                                                    batch_info = state.get_next_batch()
                                                    print(f"📚 [NEXT_BATCH] Loaded {len(batch_info.get('items', []))} fresh items (source: {batch_info.get('source')})")
                                                    tool_resp = types.FunctionResponse(
                                                        name=fc.name,
                                                        id=fc.id,
                                                        response={"result": json.dumps(batch_info, ensure_ascii=False)}
                                                    )
                                                    responses.append(tool_resp)
                                                else:
                                                    responses.append(types.FunctionResponse(name=fc.name, id=fc.id, response={"result": "ok"}))

                                            if responses:
                                                print(f"🔧 [TOOL_RESPONSE] Sending {len(responses)} function responses to Gemini Live: {[r.id for r in responses]}")
                                                await live_session.send_tool_response(function_responses=responses)
                                                print("✅ [TOOL_RESPONSE] Tool responses sent successfully to Gemini Live!")
                                        except Exception as tool_err:
                                            print(f"❌ [TOOL_ERROR] Error in tool-call handling: {tool_err}")
                                            traceback.print_exc()

                                    # 2. Handle Server Content (Audio Chunks & Transcriptions)
                                    sc = response.server_content
                                    if sc:
                                        try:
                                            # Forward User Speech-to-Text Transcript (stream deltas to UI, commit on finished)
                                            if sc.input_transcription and sc.input_transcription.text:
                                                user_text = sc.input_transcription.text.strip()
                                                if user_text:
                                                    turn_user_deltas.append(user_text)
                                                    await websocket.send(json.dumps({
                                                        "type": "transcript",
                                                        "role": "user",
                                                        "text": user_text,
                                                        "finished": bool(sc.input_transcription.finished)
                                                    }))
                                                    if sc.input_transcription.finished:
                                                        full_user = " ".join(turn_user_deltas).strip()
                                                        if full_user:
                                                            user_turns_count[0] += 1
                                                            state.add_transcript("user", full_user)
                                                            print(f"🗣️ [USER_TRANSCRIPT] {full_user}")
                                                        turn_user_deltas = []

                                            # Forward Sensei Speech Audio Chunks (24 kHz PCM)
                                            if sc.model_turn:
                                                for part in sc.model_turn.parts:
                                                    if part.inline_data and part.inline_data.data:
                                                        turn_audio_chunks += 1
                                                        raw_pcm = part.inline_data.data
                                                        audio_b64 = base64.b64encode(raw_pcm).decode("utf-8")
                                                        await websocket.send(json.dumps({
                                                            "type": "audio",
                                                            "data": audio_b64,
                                                            "rate": 24000
                                                        }))
                                                    # Fallback: only if output_transcription is missing
                                                    elif part.text and not sc.output_transcription:
                                                        txt = part.text.strip()
                                                        if txt:
                                                            turn_sensei_deltas.append(txt)
                                                            await websocket.send(json.dumps({
                                                                "type": "transcript",
                                                                "role": "sensei",
                                                                "text": txt,
                                                                "finished": True
                                                            }))

                                            # Forward Sensei Output Audio Transcription
                                            if sc.output_transcription and sc.output_transcription.text:
                                                sensei_delta = sc.output_transcription.text.strip()
                                                if sensei_delta:
                                                    turn_sensei_deltas.append(sensei_delta)
                                                    await websocket.send(json.dumps({
                                                        "type": "transcript",
                                                        "role": "sensei",
                                                        "text": sensei_delta,
                                                        "finished": bool(sc.output_transcription.finished)
                                                    }))
                                                    print(f"🌸 [SENSEI_TRANSCRIPT] {sensei_delta}")

                                            if sc.turn_complete:
                                                print(f"🔊 [TURN_COMPLETE] Model turn complete. Total 24 kHz audio chunks: {turn_audio_chunks}")
                                                # Commit full turn transcript cleanly once to session history
                                                if turn_sensei_deltas:
                                                    full_sensei = " ".join(turn_sensei_deltas).strip()
                                                    state.add_transcript("sensei", full_sensei)
                                                    print(f"🌸 [SENSEI_FULL_TURN] {full_sensei}")
                                                    turn_sensei_deltas = []

                                                if turn_user_deltas:
                                                    full_user = " ".join(turn_user_deltas).strip()
                                                    state.add_transcript("user", full_user)
                                                    turn_user_deltas = []

                                                turn_audio_chunks = 0

                                            if sc.interrupted:
                                                print("⚡ [INTERRUPT] Model turn interrupted by student.")
                                                if turn_sensei_deltas:
                                                    full_sensei = " ".join(turn_sensei_deltas).strip()
                                                    if full_sensei:
                                                        state.add_transcript("sensei", full_sensei)
                                                    turn_sensei_deltas = []
                                                await websocket.send(json.dumps({"type": "interrupted"}))

                                        except Exception as fwd_err:
                                            print(f"❌ [AUDIO_FWD_ERROR] Error forwarding audio/transcript: {fwd_err}")
                                            traceback.print_exc()

                        except (APIError, Exception) as ex:
                            # Raise to outer retry/failover handler
                            raise ex
                        finally:
                            if turn_sensei_deltas:
                                full_sensei = " ".join(turn_sensei_deltas).strip()
                                if full_sensei:
                                    state.add_transcript("sensei", full_sensei)
                            if turn_user_deltas:
                                full_user = " ".join(turn_user_deltas).strip()
                                if full_user:
                                    state.add_transcript("user", full_user)

                    # Run both directions concurrently
                    c2g_task = asyncio.create_task(client_to_gemini())
                    g2c_task = asyncio.create_task(gemini_to_client())

                    done, pending = await asyncio.wait(
                        [c2g_task, g2c_task],
                        return_when=asyncio.FIRST_COMPLETED
                    )

                    for task in pending:
                        task.cancel()

                    for task in done:
                        exc = task.exception()
                        if exc and not isinstance(exc, (asyncio.CancelledError, websockets.ConnectionClosed)):
                            raise exc

                    # If loop completed cleanly and session is no longer active
                    if not state.session_active:
                        break

            except (APIError, Exception) as err:
                err_str = str(err)
                err_name = type(err).__name__
                logger.warning("Upstream model error with %s (%s: %s)", active_model, err_name, err_str)

                # Check if client itself disconnected
                if isinstance(err, websockets.ConnectionClosed):
                    logger.info("Client closed WebSocket connection cleanly.")
                    break

                # Advance to next model in waterfall
                state.current_model_idx += 1
                if state.current_model_idx < len(LIVE_MODEL_WATERFALL):
                    next_model = LIVE_MODEL_WATERFALL[state.current_model_idx]
                    next_display = MODEL_DISPLAY_NAMES.get(next_model, next_model)
                    logger.info("Advancing model waterfall -> %s (%d turns buffered, %d whiteboard cards preserved)",
                                next_model, len(state.session_history), len(state.whiteboard_cards))
                    await websocket.send(json.dumps({
                        "type": "model_switched",
                        "model": next_display,
                        "raw_model": next_model,
                        "reason": "rate_limit_failover"
                    }))
                    await asyncio.sleep(0.5)
                else:
                    logger.error("All models in waterfall exhausted.")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "All live models temporarily at capacity. Please try again in a few moments."
                    }))
                    break
    finally:
        # Guarantee session persistence whenever len(state.session_history) >= 2 or user spoke (user_turns >= 1)
        duration_seconds = max(1, int(asyncio.get_event_loop().time() - session_start_time))
        if len(state.session_history) >= 2 or state.user_turns >= 1:
            logger.info(
                "💾 [LIVE_SESSION] Persisting session for user %s (user_id=%s, turns=%d, user_turns=%d, duration=%ds, cards=%d)",
                user["name"], user["id"], len(state.session_history), state.user_turns, duration_seconds, len(state.whiteboard_cards)
            )
            try:
                saved_session_id = save_live_session(
                    user_id=user["id"],
                    unit_focus=unit_focus,
                    duration_seconds=duration_seconds,
                    summary_json=None,
                    transcript_json=json.dumps(state.session_history, ensure_ascii=False),
                    whiteboard_json=json.dumps(state.whiteboard_cards, ensure_ascii=False),
                )
                logger.info(
                    "💾 [LIVE_SESSION] Successfully saved session ID %d for user_id=%s (turns: %d, user_turns: %d, duration: %ds). Spawning async AI recap...",
                    saved_session_id, user["id"], len(state.session_history), state.user_turns, duration_seconds
                )
                asyncio.create_task(
                    generate_session_recap_async(
                        session_id=saved_session_id,
                        transcript=state.session_history,
                        whiteboard_cards=state.whiteboard_cards,
                        user_name=user["name"],
                        unit_focus=unit_focus,
                        api_key=api_key,
                    )
                )
            except Exception as save_err:
                logger.error("❌ [LIVE_SESSION] Failed to persist live session for user %s (ID %s): %s", user["name"], user["id"], save_err)
                traceback.print_exc()
        else:
            logger.info(
                "ℹ️ [LIVE_SESSION] Skipping save for user %s: fewer than 2 turns recorded (history: %d, user_turns: %d)",
                user["name"], len(state.session_history), state.user_turns
            )

        logger.info("Live Sensei session ended for user: %s", user["name"])
        try:
            await websocket.close()
        except Exception:
            pass

async def main():
    logger.info("🌸 Starting Live Sensei WebSocket Server on ws://0.0.0.0:%d...", WS_PORT)
    logger.info("🌊 Model Waterfall: %s", " -> ".join([MODEL_DISPLAY_NAMES[m] for m in LIVE_MODEL_WATERFALL]))

    async with websockets.serve(
        handle_live_session,
        "0.0.0.0",
        WS_PORT,
        ping_interval=20,
        ping_timeout=20,
    ):
        logger.info("✅ Live Sensei WebSocket is ready and listening on port %d!", WS_PORT)
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down Live Sensei server...")
