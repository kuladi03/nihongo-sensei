import os
import sys
import hashlib
from pathlib import Path
import requests
import unittest

os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from db.database import get_connection

class TestLazyTTS(unittest.TestCase):
    def setUp(self):
        self.session = requests.Session()
        self.session.proxies = {"http": None, "https": None}
        self.static_audio_dir = Path(__file__).resolve().parent / "static" / "audio"

    def test_missing_audio_lazy_generation(self):
        print("\n[TEST] 1. Testing on-demand lazy audio generation for missing MP3...")
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT japanese, kana_only FROM mastery_items LIMIT 1")
        row = cur.fetchone()
        conn.close()

        self.assertIsNotNone(row, "Need at least one mastery item in SQLite")
        phrase = (row["kana_only"] or row["japanese"]).strip()
        phrase_hash = hashlib.md5(phrase.encode("utf-8")).hexdigest()
        filename = f"{phrase_hash}.mp3"
        target_path = self.static_audio_dir / filename

        # Ensure file does NOT exist on disk prior to request (simulate ephemeral restart)
        if target_path.exists():
            target_path.unlink()
        self.assertFalse(target_path.exists(), "Target file should not exist on disk before request")

        print(f"  -> Requesting missing audio for '{phrase}' -> {filename}...")
        url = f"http://127.0.0.1:8000/static/audio/{filename}"
        res = self.session.get(url, timeout=10)

        self.assertEqual(res.status_code, 200, f"Expected 200, got {res.status_code}: {res.text}")
        self.assertEqual(res.headers.get("Content-Type"), "audio/mpeg")
        self.assertGreater(len(res.content), 1000, "Audio response content should be > 1000 bytes")

        # Verify cached on disk
        self.assertTrue(target_path.exists(), "Lazy TTS must cache the generated audio to disk")
        self.assertGreater(target_path.stat().st_size, 1000)
        print(f"  -> Generated and cached {target_path.stat().st_size} bytes cleanly!")

        # Second request must serve immediately from cache
        print("  -> Testing second request serves from disk cache...")
        res_cached = self.session.get(url, timeout=5)
        self.assertEqual(res_cached.status_code, 200)
        self.assertEqual(len(res_cached.content), target_path.stat().st_size)
        print("  -> Passed On-Demand Lazy TTS test!")

if __name__ == "__main__":
    unittest.main()
