import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from db.database import TursoRow, TursoCursor, TursoConnection, is_turso_configured, get_connection

class TestTursoDatabase(unittest.TestCase):
    def test_turso_row_semantics(self):
        print("\n[TEST] 1. Testing TursoRow dictionary and index access...")
        cols = ["id", "japanese", "romaji", "ease_factor"]
        vals = (10, "本", "hon", 2.5)
        row = TursoRow(cols, vals)

        self.assertEqual(row["japanese"], "本")
        self.assertEqual(row["romaji"], "hon")
        self.assertEqual(row[0], 10)
        self.assertEqual(row[1], "本")
        self.assertEqual(row.get("ease_factor"), 2.5)
        self.assertIsNone(row.get("nonexistent"))

        d = dict(row)
        self.assertEqual(d, {"id": 10, "japanese": "本", "romaji": "hon", "ease_factor": 2.5})
        print("  -> Passed TursoRow semantics test!")

    def test_turso_connection_in_memory(self):
        print("\n[TEST] 2. Testing TursoConnection with in-memory libsql database...")
        import libsql_experimental as libsql
        raw = libsql.connect(":memory:")
        conn = TursoConnection(raw)

        # Test schema script execution & transactions
        with conn:
            conn.execute("CREATE TABLE test_items (id INTEGER PRIMARY KEY, word TEXT, count INTEGER);")
            conn.execute("INSERT INTO test_items (word, count) VALUES (?, ?);", ("猫", 3))

        cur = conn.cursor()
        cur.execute("SELECT * FROM test_items WHERE word = ?;", ("猫",))
        item = cur.fetchone()
        self.assertIsNotNone(item)
        self.assertEqual(item["word"], "猫")
        self.assertEqual(item["count"], 3)
        self.assertEqual(dict(item)["word"], "猫")

        # Test fetchall
        cur.execute("SELECT * FROM test_items;")
        items = cur.fetchall()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["word"], "猫")

        # Test rollback on exception
        try:
            with conn:
                conn.execute("INSERT INTO test_items (word, count) VALUES (?, ?);", ("犬", 5))
                raise ValueError("Simulated error")
        except ValueError:
            pass

        cur.execute("SELECT * FROM test_items WHERE word = ?;", ("犬",))
        self.assertIsNone(cur.fetchone())
        print("  -> Passed TursoConnection transaction and CRUD test!")

    def test_current_engine(self):
        print("\n[TEST] 3. Testing get_connection() engine detection...")
        conn = get_connection()
        self.assertIsNotNone(conn)
        turso_active = is_turso_configured()
        print(f"  -> Active engine: {'Direct Remote Turso' if turso_active else 'Local SQLite (db/nihongo.db)'}")
        conn.close()

    def test_turso_direct_and_cache(self):
        print("\n[TEST] 4. Testing Direct Turso Connection singleton & In-Memory TTL Cache...")
        import libsql_experimental as libsql
        import db.database as db_mod

        raw = libsql.connect(":memory:")
        conn = TursoConnection(raw, is_singleton=True)
        # Test close is a no-op when is_singleton=True
        conn.close()
        cur = conn.cursor()
        cur.execute("CREATE TABLE t (v TEXT);")
        cur.execute("INSERT INTO t VALUES ('ok');")
        cur.execute("SELECT v FROM t;")
        self.assertEqual(cur.fetchone()["v"], "ok")

        # Test InMemoryTTLCache
        cache = db_mod.InMemoryTTLCache(default_ttl=1.0)
        cache.set("test:1", {"foo": "bar"})
        self.assertEqual(cache.get("test:1"), {"foo": "bar"})

        # Test prefix invalidation
        cache.set("test:2", 42)
        cache.set("other:1", 99)
        cache.invalidate_prefix("test:")
        self.assertIsNone(cache.get("test:1"))
        self.assertIsNone(cache.get("test:2"))
        self.assertEqual(cache.get("other:1"), 99)

        print("  -> Passed Direct Turso and In-Memory TTL Cache test!")

if __name__ == "__main__":
    unittest.main()

