import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from db.database import (
    get_connection,
    get_pool,
    InMemoryTTLCache,
    CompatibleCursor,
)

class TestPostgresDatabase(unittest.TestCase):
    def setUp(self):
        self.conn = get_connection()

    def tearDown(self):
        if self.conn:
            self.conn.close()

    def test_compatible_cursor_adaptation(self):
        print("\n[TEST] 1. Testing CompatibleCursor query parameter adaptation (? -> %s)...")
        cur = self.conn.cursor()
        cur.execute("SELECT %s as greeting, %s as val", ("こんにちは", 42))
        row = cur.fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["greeting"], "こんにちは")
        self.assertEqual(row["val"], 42)

        # Test automatic ? adaptation
        cur.execute("SELECT ? as adapted_greeting, ? as adapted_val", ("ありがとう", 99))
        row2 = cur.fetchone()
        self.assertIsNotNone(row2)
        self.assertEqual(row2["adapted_greeting"], "ありがとう")
        self.assertEqual(row2["adapted_val"], 99)
        print("  -> Passed CompatibleCursor adaptation test!")

    def test_transactions_and_rollback(self):
        print("\n[TEST] 2. Testing transaction rollback on exception...")
        with self.conn:
            cur = self.conn.cursor()
            cur.execute("CREATE TEMPORARY TABLE temp_test (id SERIAL PRIMARY KEY, val TEXT);")
            cur.execute("INSERT INTO temp_test (val) VALUES (%s)", ("committed",))

        # Test failed transaction
        try:
            with self.conn:
                cur = self.conn.cursor()
                cur.execute("INSERT INTO temp_test (val) VALUES (%s)", ("uncommitted",))
                raise ValueError("Simulated error")
        except ValueError:
            pass

        cur = self.conn.cursor()
        cur.execute("SELECT val FROM temp_test")
        rows = [r["val"] for r in cur.fetchall()]
        self.assertIn("committed", rows)
        self.assertNotIn("uncommitted", rows)
        print("  -> Passed transaction rollback test!")

    def test_in_memory_ttl_cache(self):
        print("\n[TEST] 3. Testing InMemoryTTLCache...")
        cache = InMemoryTTLCache(default_ttl=1.0)
        cache.set("test:1", {"foo": "bar"})
        self.assertEqual(cache.get("test:1"), {"foo": "bar"})

        # Test prefix invalidation
        cache.set("test:2", 42)
        cache.set("other:1", 99)
        cache.invalidate_prefix("test:")
        self.assertIsNone(cache.get("test:1"))
        self.assertIsNone(cache.get("test:2"))
        self.assertEqual(cache.get("other:1"), 99)
        print("  -> Passed InMemoryTTLCache test!")

if __name__ == "__main__":
    unittest.main()
