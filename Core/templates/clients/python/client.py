"""
RitaWapp wsApi Python Reference Client
Uses standard library or optional websockets module.
"""
import asyncio
import json

async def main():
    try:
        import websockets
        uri = "ws://127.0.0.1:19800/rwa"
        async with websockets.connect(uri) as websocket:
            print("Connected to RitaWapp wsApi from Python!")
            await websocket.send(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "rwa.ping"}))
            response = await websocket.recv()
            print(f"Received: {response}")
    except ImportError:
        print("Install 'websockets' via pip to run Python sample: pip install websockets")

if __name__ == "__main__":
    asyncio.run(main())
