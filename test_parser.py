import unittest
import sqlite3
from agents.notion_agent import NotionSyncAgent
from db.database import init_database, get_connection, save_notion_sync, get_notion_sync

class TestNotionParsingAndDB(unittest.TestCase):
    def setUp(self):
        init_database()
        self.agent = NotionSyncAgent(token="mock_secret_token")

    def test_hash_computation(self):
        text1 = "# 19 Nov 2026 Japanese Class 01\nIntroduction to Hiragana"
        text2 = "# 19 Nov 2026 Japanese Class 01\nIntroduction to Hiragana"
        text3 = "# 19 Nov 2026 Japanese Class 01\nModified content"

        h1 = self.agent.compute_hash(text1)
        h2 = self.agent.compute_hash(text2)
        h3 = self.agent.compute_hash(text3)

        self.assertEqual(h1, h2)
        self.assertNotEqual(h1, h3)
        self.assertEqual(len(h1), 64)

    def test_extract_text(self):
        rich = [
            {"plain_text": "Konnichiwa (", "type": "text"},
            {"plain_text": "こんにちは", "type": "text"},
            {"plain_text": ")", "type": "text"}
        ]
        text = self.agent._extract_text(rich)
        self.assertEqual(text, "Konnichiwa (こんにちは)")

    def test_sqlite_sync_storage(self):
        page_id = "41d1f226830e81c681d0fe628ee1319c"
        title = "19 Nov 2026 Japanese Class 01"
        notes = """# 19 Nov 2026 Japanese Class 01
## Phonetic Nuance
- [ ] Practice unaspirated 'क' vs aspirated 'ख'
- [ ] Understand why こんにちは ends in は pronounced 'wa'

| Kanji / Kana | Romaji | English | Marathi Cue |
| --- | --- | --- | --- |
| こんにちは | Konnichiwa | Hello / Good day | 'हा' नाही, 'वा' उच्चार |
| ありがとう | Arigatou | Thank you | धन्यावाद |
"""
        h = self.agent.compute_hash(notes)
        save_notion_sync(page_id, title, h, notes, "2026-11-20T10:00:00.000Z")

        saved = get_notion_sync(page_id)
        self.assertIsNotNone(saved)
        self.assertEqual(saved["title"], title)
        self.assertEqual(saved["content_hash"], h)
        self.assertIn("Marathi Cue", saved["raw_markdown"])
        print("\n✅ SQLite test passed: Saved & retrieved Class 01 mock notes cleanly.")

if __name__ == "__main__":
    unittest.main()
