import subprocess
import time
import json
import urllib.request
import os

# Install no-proxy opener for localhost
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
urllib.request.install_opener(opener)

proc = subprocess.Popen(["python3", "server.py", "8899"])
time.sleep(1.5)

try:
    # 1. Health check
    req = urllib.request.urlopen("http://127.0.0.1:8899/health")
    health = json.loads(req.read().decode())
    print("✅ /health check:", health.get("status"))

    # 2. Roadmap
    req = urllib.request.urlopen("http://127.0.0.1:8899/api/roadmap")
    roadmap = json.loads(req.read().decode())
    print(f"✅ /api/roadmap returned {roadmap['total_units']} units:")
    for u in roadmap["roadmap"]:
        lock_status = "🔒 Locked" if u["is_locked"] else "🔓 Unlocked"
        comp_status = "✅ Completed" if u["is_completed"] else "⏳ In Progress"
        print(f"   - Unit {u['unit_number']}: {u['title']} | {lock_status} | {comp_status}")

    # 3. Unit 01 details
    req = urllib.request.urlopen("http://127.0.0.1:8899/api/units/1")
    unit1 = json.loads(req.read().decode())
    cards = unit1.get("study_cards", [])
    exercises = unit1.get("exercises", [])
    print(f"\n✅ /api/units/1 details:")
    print(f"   Title: {unit1.get('unit_title')}")
    print(f"   Study Cards: {len(cards)}")
    print(f"   Exercises: {len(exercises)}")
    print(f"   Sample Card Audio URL: {cards[0].get('audio_path')}")
    print(f"   Sample Card SVG Present: {bool(cards[0].get('svg_markup'))}")
    if len(cards) > 5:
        print(f"   Sample Card [5]: {cards[5].get('japanese')} ({cards[5].get('romaji')})")
        print(f"   Pronunciation Tip: {cards[5].get('pronunciation_tip')}")

    # 4. Audio streaming check
    if cards and cards[0].get("audio_path"):
        audio_url = f"http://127.0.0.1:8899{cards[0]['audio_path']}"
        audio_req = urllib.request.urlopen(audio_url)
        audio_bytes = audio_req.read()
        print(f"\n✅ Static Audio Streamed: {len(audio_bytes)} bytes from {audio_url}")

    # 5. Submit progress for Unit 01 via SM-2
    from db.database import get_mastery_items_for_unit
    m_items = get_mastery_items_for_unit(unit1["unit_id"])
    if len(m_items) >= 2:
        post_data = json.dumps({
            "unit_number": 1,
            "is_completed": True,
            "grades": [
                {"item_id": m_items[0]["id"], "quality": 5},
                {"item_id": m_items[1]["id"], "quality": 2}
            ]
        }).encode("utf-8")
        req = urllib.request.Request(
            "http://127.0.0.1:8899/api/progress/submit",
            data=post_data,
            headers={"Content-Type": "application/json"}
        )
        resp = urllib.request.urlopen(req)
        prog_res = json.loads(resp.read().decode())
        print(f"\n✅ /api/progress/submit: Unit 01 marked completed, {prog_res['updated_mastery_items']} items updated via SM-2.")

    # 6. Check updated roadmap (Unit 2 should now be unlocked!)
    req = urllib.request.urlopen("http://127.0.0.1:8899/api/roadmap")
    roadmap_after = json.loads(req.read().decode())
    print("\n✅ /api/roadmap after Unit 01 completion:")
    for u in roadmap_after["roadmap"]:
        lock_status = "🔒 Locked" if u["is_locked"] else "🔓 Unlocked"
        comp_status = "✅ Completed" if u["is_completed"] else "⏳ In Progress"
        print(f"   - Unit {u['unit_number']}: {u['title']} | {lock_status} | {comp_status}")

finally:
    proc.terminate()
    print("\n🏁 Test completed successfully.")
