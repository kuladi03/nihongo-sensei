import os
import sys
import json
import asyncio
import requests
import unittest

os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

import websockets

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from auth import create_access_token
from db.database import get_connection

class TestUnifiedServer(unittest.TestCase):
    def setUp(self):
        self.session = requests.Session()
        self.session.proxies = {"http": None, "https": None}
        self.base_url = "http://127.0.0.1:8000"

    def test_spa_frontend_serving(self):
        print("\n[TEST] 1. Testing SPA Frontend root serving on port 8000...")
        res = self.session.get(self.base_url, timeout=5)
        self.assertEqual(res.status_code, 200)
        self.assertIn("<!doctype html>", res.text.lower())
        self.assertIn("id=\"root\"", res.text)
        self.assertIn("/manifest.json", res.text)
        self.assertIn("apple-mobile-web-app-capable", res.text)
        print("  -> Passed SPA index.html serving test!")

    def test_pwa_manifest(self):
        print("\n[TEST] 2. Testing PWA manifest.json serving...")
        res = self.session.get(f"{self.base_url}/manifest.json", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("name"), "Nihongo Sensei (日本語先生)")
        self.assertEqual(data.get("short_name"), "Sensei")
        self.assertEqual(data.get("display"), "standalone")
        self.assertEqual(data.get("theme_color"), "#2B4C7E")
        self.assertEqual(data.get("background_color"), "#FAF8F5")
        self.assertTrue(len(data.get("icons", [])) >= 2)
        print("  -> Passed PWA manifest test!")

    def test_api_health_endpoint(self):
        print("\n[TEST] 3. Testing API health endpoint...")
        res = self.session.get(f"{self.base_url}/api/health", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "online")
        self.assertTrue(data.get("unified_server"))
        print(f"  -> Database reported: {data.get('database')}")
        print("  -> Passed API health test!")

    def test_live_sensei_websocket_on_port_8000(self):
        print("\n[TEST] 4. Testing Live Sensei WebSocket on unified single-port ws://localhost:8000/api/live/session...")
        async def run_ws_test():
            conn = get_connection()
            user_row = conn.execute("SELECT * FROM users ORDER BY xp DESC LIMIT 1").fetchone()
            user = dict(user_row)
            token = create_access_token(user)
            ws_url = f"ws://127.0.0.1:8000/api/live/session?token={token}"

            async with websockets.connect(ws_url) as ws:
                init_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10.0))
                print(f"  -> WebSocket connected on port 8000: {init_msg.get('type')}, model: {init_msg.get('model')}")
                self.assertEqual(init_msg.get("type"), "session_ready")

                # Send a text greeting
                await ws.send(json.dumps({"type": "text", "text": "こんにちは！"}))

                received_audio = False
                start = asyncio.get_event_loop().time()
                while asyncio.get_event_loop().time() - start < 10.0 and not received_audio:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    msg = json.loads(raw)
                    if msg.get("type") == "audio":
                        received_audio = True
                        print(f"  -> Received 24kHz audio chunk on unified port 8000!")

                self.assertTrue(received_audio, "Expected at least 1 audio chunk from Sensei")
                await ws.send(json.dumps({"type": "end_call"}))
                await asyncio.sleep(0.5)

        asyncio.run(run_ws_test())
        print("  -> Passed Live Sensei single-port WebSocket test!")

if __name__ == "__main__":
    unittest.main()
