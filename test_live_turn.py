import asyncio
import json
import os
import sys

# Ensure local addresses bypass proxy
os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

import websockets

# Import auth and db
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from auth import create_access_token
from db.database import get_connection, get_user_by_id

async def test_live_conversation():
    # 1. Fetch an existing active user from the database
    conn = get_connection()
    user_row = conn.execute("SELECT * FROM users ORDER BY xp DESC LIMIT 1").fetchone()
    if not user_row:
        raise RuntimeError("No users found in database.")
    user = dict(user_row)
    token = create_access_token(user)
    print(f"🔑 Using active student: {user['name']} (ID: {user['id']}, XP: {user['xp']}, Role: {user['role']})")

    ws_url = f"ws://127.0.0.1:8001/?token={token}"
    print(f"🔌 Connecting to {ws_url}...")

    audio_chunks_received = 0
    sensei_transcripts = []
    whiteboard_cards = []

    async with websockets.connect(ws_url) as ws:
        # Wait for session_ready
        init_msg = await asyncio.wait_for(ws.recv(), timeout=12.0)
        data = json.loads(init_msg)
        print(f"📡 Initial message from server: {data}")
        assert data.get("type") in ["session_ready", "model_switched"], f"Unexpected initial msg: {data}"

        # Send a prompt to Sensei asking for a card and spoken explanation
        test_turn = "こんにちは、先生！「ありがとう」のカードを見せてください。(Hello Sensei! Please show me the card for Arigatou and explain it.)"
        print(f"\n🗣️ Sending student input to Sensei: {test_turn}")
        await ws.send(json.dumps({
            "type": "text",
            "text": test_turn
        }))

        # Listen for Sensei's response (tool call, audio chunks, transcript)
        # Timeout after 25 seconds
        start_time = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start_time < 25.0:
            try:
                msg_raw = await asyncio.wait_for(ws.recv(), timeout=4.0)
                msg = json.loads(msg_raw)
                msg_type = msg.get("type")

                if msg_type == "audio":
                    audio_chunks_received += 1
                    if audio_chunks_received == 1:
                        print(f"🔊 [AUDIO] First 24kHz audio chunk received! (rate: {msg.get('rate')}, len: {len(msg.get('data', ''))})")
                elif msg_type == "transcript":
                    role = msg.get("role")
                    text = msg.get("text")
                    print(f"📝 [TRANSCRIPT] {role}: {text}")
                    if role == "sensei":
                        sensei_transcripts.append(text)
                elif msg_type == "whiteboard_card":
                    card = msg.get("card")
                    whiteboard_cards.append(card)
                    print(f"🎨 [WHITEBOARD CARD] {card}")
                elif msg_type == "error":
                    print(f"❌ [ERROR] {msg.get('message')}")
                else:
                    print(f"ℹ️ [OTHER] {msg_type}: {msg}")

                # If we've received at least 5 audio chunks and a sensei transcript, test succeeded!
                if audio_chunks_received >= 5 and len(sensei_transcripts) > 0:
                    print(f"\n🎉 Test criteria satisfied early! Audio chunks: {audio_chunks_received}, Transcripts: {len(sensei_transcripts)}, Cards: {len(whiteboard_cards)}")
                    break

            except asyncio.TimeoutError:
                # If we already have audio, break
                if audio_chunks_received > 0:
                    break
                print("⏳ Waiting for Sensei's voice response...")

        # Close session cleanly
        await ws.send(json.dumps({"type": "end_call"}))

    print("\n================ TEST SUMMARY ================")
    print(f"Total 24kHz Audio Chunks Received: {audio_chunks_received}")
    print(f"Sensei Transcripts Received:       {len(sensei_transcripts)}")
    print(f"Whiteboard Cards Dispatched:       {len(whiteboard_cards)}")
    print("==============================================")

    assert audio_chunks_received > 0, "Failed: 0 audio chunks were received from Sensei!"
    print("✅ Live Sensei Audio Playback and Relay Test Passed Successfully!")

if __name__ == "__main__":
    asyncio.run(test_live_conversation())
