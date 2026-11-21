import os
import sys

os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

import requests
import unittest

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from db.database import (
    upsert_notion_page_sync_state,
    get_notion_page_sync_state,
    get_all_notion_page_sync_states,
    get_connection,
)
from auth import create_access_token
import server

class TestNotionAutoSync(unittest.TestCase):
    def setUp(self):
        self.conn = get_connection()
        admin_row = self.conn.execute("SELECT * FROM users WHERE role = 'admin' LIMIT 1").fetchone()
        self.admin = dict(admin_row) if admin_row else {"id": "admin-1", "name": "Admin", "role": "admin"}
        self.admin_token = create_access_token(self.admin)
        self.auth_headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.test_page_id = "test-page-auto-sync-uuid"
        self.clean_page_id = self.test_page_id.replace("-", "").strip()
        self.session = requests.Session()
        self.session.proxies = {"http": None, "https": None}

    def tearDown(self):
        with self.conn:
            self.conn.execute("DELETE FROM notion_page_sync_state WHERE page_id IN (?, ?)", (self.test_page_id, self.clean_page_id))

    def test_database_sync_state_crud(self):
        print("\n[TEST] 1. Testing notion_page_sync_state CRUD in SQLite...")
        upsert_notion_page_sync_state(self.test_page_id, "2026-11-21T12:00:00.000Z")
        state = get_notion_page_sync_state(self.test_page_id)
        self.assertIsNotNone(state)
        self.assertEqual(state["page_id"], self.clean_page_id)
        self.assertEqual(state["last_edited_time"], "2026-11-21T12:00:00.000Z")
        self.assertIsNotNone(state["last_synced_at"])

        all_states = get_all_notion_page_sync_states()
        self.assertIn(self.clean_page_id, all_states)
        self.assertEqual(all_states[self.clean_page_id], "2026-11-21T12:00:00.000Z")
        print("  -> Passed CRUD test!")

    def test_sync_status_api(self):
        print("\n[TEST] 2. Testing GET /api/sync/status endpoint...")
        resp = self.session.get("http://127.0.0.1:8000/api/sync/status", timeout=5)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        print(f"  -> Response: {data}")
        self.assertEqual(data.get("status"), "ok")
        self.assertTrue(data.get("auto_sync_enabled"))
        self.assertEqual(data.get("interval_minutes"), 15)
        self.assertIn("is_syncing", data)
        self.assertIn("last_checked_at", data)
        print("  -> Passed GET /api/sync/status test!")

    def test_sync_lock_conflict_safeguard(self):
        print("\n[TEST] 3. Testing 409 Conflict Safeguard when SYNC_LOCK is held...")
        import threading
        from http.server import ThreadingHTTPServer
        test_server = ThreadingHTTPServer(("127.0.0.1", 8005), server.SenseiHandler)
        t = threading.Thread(target=test_server.serve_forever, daemon=True)
        t.start()
        try:
            acquired = server.SYNC_LOCK.acquire(blocking=False)
            self.assertTrue(acquired, "Should be able to acquire SYNC_LOCK for test")
            try:
                # Request manual sync while background sync holds lock
                resp = self.session.post(
                    "http://127.0.0.1:8005/api/sync/notion",
                    headers=self.auth_headers,
                    timeout=5
                )
                print(f"  -> POST /api/sync/notion status: {resp.status_code}, body: {resp.text}")
                self.assertEqual(resp.status_code, 409)
                data = resp.json()
                self.assertEqual(data.get("status"), "already_syncing")

                # Request build units while lock is held
                resp_build = self.session.post(
                    "http://127.0.0.1:8005/api/build-units",
                    headers=self.auth_headers,
                    timeout=5
                )
                print(f"  -> POST /api/build-units status: {resp_build.status_code}, body: {resp_build.text}")
                self.assertEqual(resp_build.status_code, 409)
                data_build = resp_build.json()
                self.assertEqual(data_build.get("status"), "already_syncing")
                print("  -> Passed 409 conflict safeguard test!")
            finally:
                server.SYNC_LOCK.release()
        finally:
            test_server.shutdown()
            test_server.server_close()

if __name__ == "__main__":
    unittest.main()
