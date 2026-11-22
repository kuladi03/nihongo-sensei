import asyncio
import json
import os
import sys
import time
import requests

os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

import websockets

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from auth import create_access_token
from db.database import get_connection

async def test_persistence():
    conn = get_connection()
    user_row = conn.execute("SELECT * FROM users ORDER BY xp DESC LIMIT 1").fetchone()
    user = dict(user_row)
    token = create_access_token(user)
    headers = {"Authorization": f"Bearer {token}"}

    http_session = requests.Session()
    http_session.proxies = {"http": None, "https": None}

    print(f"\n[TEST] 1. Checking past sessions before call for user '{user['name']}' ({user['id']})...")
    res_before = http_session.get("http://127.0.0.1:8000/api/live/sessions", headers=headers, timeout=5)
    assert res_before.status_code == 200, f"Expected 200, got {res_before.status_code}"
    sessions_before = res_before.json().get("sessions", [])
    count_before = len(sessions_before)
    print(f"  -> Found {count_before} existing sessions.")

    ws_url = f"ws://127.0.0.1:8000/api/live/session?token={token}"
    print(f"\n[TEST] 2. Connecting to Live Sensei at {ws_url}...")

    async with websockets.connect(ws_url) as ws:
        init_raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
        init_msg = json.loads(init_raw)
        print(f"  -> Connected: {init_msg.get('type')}, model: {init_msg.get('model')}")

        # Send Turn 1: User greets sensei
        print("\n[TEST] 3. Sending Turn 1: 'こんにちは、先生！お元気ですか？'...")
        await ws.send(json.dumps({
            "type": "text",
            "text": "こんにちは、先生！お元気ですか？"
        }))

        # Wait for Sensei audio response
        audio_chunks = 0
        transcript_received = False
        start_time = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start_time < 12.0:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
                msg = json.loads(raw)
                mtype = msg.get("type")
                if mtype == "audio":
                    audio_chunks += 1
                elif mtype == "transcript":
                    transcript_received = True
                    print(f"     [{msg.get('role')}]: {msg.get('text')}")
                if audio_chunks >= 3 and transcript_received:
                    break
            except asyncio.TimeoutError:
                break

        print(f"  -> Turn 1 complete: received {audio_chunks} audio chunks.")

        # Send Turn 2
        print("\n[TEST] 4. Sending Turn 2: '日本の食べ物が好きです。'...")
        await ws.send(json.dumps({
            "type": "text",
            "text": "日本の食べ物が好きです。"
        }))

        audio_chunks2 = 0
        start_time2 = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start_time2 < 12.0:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
                msg = json.loads(raw)
                if msg.get("type") == "audio":
                    audio_chunks2 += 1
                elif msg.get("type") == "transcript":
                    print(f"     [{msg.get('role')}]: {msg.get('text')}")
                if audio_chunks2 >= 3:
                    break
            except asyncio.TimeoutError:
                break

        print(f"  -> Turn 2 complete: received {audio_chunks2} audio chunks.")

        # End call cleanly
        print("\n[TEST] 5. Sending end_call...")
        await ws.send(json.dumps({"type": "end_call"}))
        await asyncio.sleep(1.0)

    print("\n[TEST] 6. Verifying persistence in SQLite & GET /api/live/sessions...")
    # Give the server a moment to complete the finally: block write
    await asyncio.sleep(2.0)

    res_after = http_session.get("http://127.0.0.1:8000/api/live/sessions", headers=headers, timeout=5)
    assert res_after.status_code == 200, f"Expected 200, got {res_after.status_code}"
    sessions_after = res_after.json().get("sessions", [])
    count_after = len(sessions_after)
    print(f"  -> Sessions count after call: {count_after} (was {count_before})")

    assert count_after > count_before, f"Expected count_after ({count_after}) > count_before ({count_before})"

    latest_session = sessions_after[0]
    transcript_len = len(latest_session.get("transcript") or [])
    print(f"  -> Latest session: ID={latest_session['id']}, transcript_turns={transcript_len}, duration={latest_session['duration_seconds']}s")
    assert transcript_len >= 1, f"Expected transcript_turns >= 1, got {transcript_len}"
    assert latest_session["duration_seconds"] >= 0

    # Wait up to 6 seconds to see if recap pops in
    print("\n[TEST] 7. Polling for AI recap summary...")
    for i in range(4):
        await asyncio.sleep(1.5)
        check_res = http_session.get("http://127.0.0.1:8000/api/live/sessions", headers=headers, timeout=5)
        check_sessions = check_res.json().get("sessions", [])
        if check_sessions and check_sessions[0].get("summary_json"):
            print(f"  -> AI Recap generated: {check_sessions[0]['summary_json']}")
            break

    print("\n🎉 ALL PERSISTENCE CHECKS PASSED!")

if __name__ == "__main__":
    asyncio.run(test_persistence())
