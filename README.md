# Nihongo Sensei (日本語先生)

An AI-powered personal Japanese Sensei built strictly around your real syllabus, preserving Marathi/English phonetic traps (e.g., unaspirated 'क' vs aspirated 'ख', or why こんにちは's final は is pronounced 'wa'), authentic native speech, and SM-2 Spaced Repetition.

---

## 🌟 Architecture & Highlights

- **Backend**: Python 3.12, SQLite `db/nihongo.db`, Edge-TTS (`ja-JP-NanamiNeural`), Google GenAI (`gemini-2.5-flash` / `gemini-3.5-flash`), Iconify SVG API.
- **Frontend**: React + Vite + Tailwind CSS (v3.4) + Framer Motion + Lucide React.
- **Phonetic Nuance Engine**: Tests Marathi sound traps and pronunciation rules directly from your real class notes.
- **Multimodal Drills**: 6 interactive exercise types (`AUDIO_TO_MEANING`, `PRONUNCIATION_TRAP`, `POLITENESS_RANK`, `SITUATIONAL_CHOICE`, `TILE_BUILDER`, `SPEAKING_CHECK` with `ja-JP` Web Speech API).
- **Spaced Repetition & 5-Unit Boss Trials**: Adaptive SM-2 memory engine + automatic Gold Trophy Boss checkpoints every 5 units.

---

## 📁 Project Structure

```
nihongo-sensei/
├── start.sh              # 🚀 1-Click Launcher (Starts Backend + Frontend)
├── server.py             # Lightweight REST API server & Audio streamer
├── build_curriculum.py   # Multi-agent curriculum synthesis pipeline
├── .env                  # Notion Hub Page ID & API Keys
├── requirements.txt      # Python dependencies
├── agents/
│   ├── notion_agent.py   # Agent 1: Notion Hub Sync & Hash Change Detector
│   ├── curriculum_agent.py # Agent 2: Pydantic Curriculum Architect (6 Drill Types)
│   ├── media_agent.py    # Agent 3: Edge-TTS Audio & Iconify SVG Enricher
│   └── memory_boss_agent.py # Agent 4: SM-2 Spaced Repetition & 5-Unit Boss Engine
├── db/
│   ├── schema.sql        # Database schema
│   ├── database.py       # SQLite connection manager & query helpers
│   └── nihongo.db        # Active SQLite database
├── static/
│   └── audio/            # Cached neural Japanese MP3s (MD5 keyed)
└── frontend/             # React + Vite application
    ├── src/
    │   ├── components/   # TopBar, SvgIcon, AudioButton
    │   ├── context/      # AppContext (Romaji toggle, XP, Streak, Unit State)
    │   └── views/        # RoadmapView, StudyDeckView, ExercisePlayerView, WeakGymView
    ├── vite.config.js    # Dev server with /api and /static proxy
    └── tailwind.config.js # Japanese slate/ink theme with matcha & amber accents
```

---

## 🚀 How to Run

### Option 1: 1-Click Launch (Recommended)
```bash
cd /home/hari/.gemini/antigravity/scratch/nihongo-sensei
./start.sh
```
Open your browser at:
👉 **`http://localhost:5173`**

### Option 2: Running Services Separately

**Backend Server (Port 8000):**
```bash
cd /home/hari/.gemini/antigravity/scratch/nihongo-sensei
python3 server.py 8000
```

**Frontend Dev Server (Port 5173):**
```bash
cd /home/hari/.gemini/antigravity/scratch/nihongo-sensei/frontend
npm run dev
```

---

## 🔄 Daily Sync Workflow

When you update your [Japanese Class Notes Notion Hub](https://app.notion.com/p/Japanese-Class-Notes-41d1f226830e816891a7cebe4ff5e0f6) with a new class (Class 03, Class 04...):
1. Simply click the **Sync Notion** button in the top right corner of the web interface.
2. The agent automatically detects the new class, extracts phonetics & vocabulary, generates exercises, synthesizes audio, and adds the new unit to your roadmap!
