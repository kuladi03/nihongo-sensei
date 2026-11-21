import asyncio
import json
import os
import sys

os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

import websockets

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from auth import create_access_token
from db.database import get_connection

async def test_two_turns():
    conn = get_connection()
    user_row = conn.execute("SELECT * FROM users ORDER BY xp DESC LIMIT 1").fetchone()
    user = dict(user_row)
    token = create_access_token(user)

    ws_url = f"ws://127.0.0.1:8001/?token={token}"
    print(f"🔌 Connecting to {ws_url}...")

    async with websockets.connect(ws_url) as ws:
        init_msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
        print(f"📡 {json.loads(init_msg)}")

        # Turn 1: Conversational greeting
        print("\n🗣️ Turn 1: おはようございます！今日の天気を教えてください。")
        await ws.send(json.dumps({"type": "text", "text": "おはようございます！今日の天気を教えてください。"}))

        audio_t1 = 0
        t1_done = False
        start = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start < 15.0 and not t1_done:
            msg = json.loads(await ws.recv())
            if msg.get("type") == "audio":
                audio_t1 += 1
            elif msg.get("type") == "transcript":
                print(f"   [{msg.get('role')}]: {msg.get('text')}")
            if audio_t1 >= 5:
                t1_done = True
                print(f"✅ Turn 1 received {audio_t1} audio chunks.")

        # Turn 2: Followup question
        print("\n🗣️ Turn 2: 日本語で「ありがとう」はどう言いますか？")
        await ws.send(json.dumps({"type": "text", "text": "日本語で「ありがとう」はどう言いますか？"}))

        audio_t2 = 0
        t2_done = False
        start = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start < 15.0 and not t2_done:
            msg = json.loads(await ws.recv())
            if msg.get("type") == "audio":
                audio_t2 += 1
            elif msg.get("type") == "transcript":
                print(f"   [{msg.get('role')}]: {msg.get('text')}")
            if audio_t2 >= 5:
                t2_done = True
                print(f"✅ Turn 2 received {audio_t2} audio chunks.")

        await ws.send(json.dumps({"type": "end_call"}))

    print("\n================ SUMMARY ================")
    print(f"Turn 1 Audio Chunks: {audio_t1}")
    print(f"Turn 2 Audio Chunks: {audio_t2}")
    print("=========================================")
    assert audio_t1 > 0 and audio_t2 > 0, "Both turns must receive audio!"
    print("🎉 Multi-turn conversational voice streaming verified!")

if __name__ == "__main__":
    asyncio.run(test_two_turns())
