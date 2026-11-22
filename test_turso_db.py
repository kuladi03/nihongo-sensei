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
        print(f"  -> Active engine: {'Turso Embedded Replica' if turso_active else 'Local SQLite (db/nihongo.db)'}")
        conn.close()

    def test_turso_sync_method_and_replica_guard(self):
        print("\n[TEST] 4. Testing TursoConnection sync method and replica guard...")
        import libsql_experimental as libsql
        import db.database as db_mod

        raw = libsql.connect(":memory:")
        conn = TursoConnection(raw)
        # Test sync method delegation
        sync_result = conn.sync()
        self.assertIsNone(sync_result)  # In-memory conn has sync() which returns None

        # Verify module-level flag exists and can be inspected
        self.assertIn("_replica_initialized", dir(db_mod))
        print("  -> Passed Turso sync method and replica guard test!")

if __name__ == "__main__":
    unittest.main()

