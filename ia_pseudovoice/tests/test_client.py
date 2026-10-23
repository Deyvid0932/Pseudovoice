"""Read-only smoke check of the running local voice service.

Run: python ia_pseudovoice/tests/test_client.py
"""
import asyncio
import json
import httpx
import websockets

from pseudovoice.config import settings


async def run_test():
    base = f"http://127.0.0.1:{settings.PORT}"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(base + "/health")
        response.raise_for_status()
        health = response.json()
        assert health["mode"] == "local"
        assert health["stt_ready"], "Whisper no está listo."
        response = await client.options(
            base + "/voices/probe.wav",
            headers={
                "Origin": "http://localhost:1420",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "http://localhost:1420"
    async with websockets.connect(base.replace("http://", "ws://") + "/ws/inference") as ws:
        if settings.INFERENCE_ACCESS_KEY:
            await ws.send(json.dumps({"type": "auth", "token": settings.INFERENCE_ACCESS_KEY}))
            assert json.loads(await asyncio.wait_for(ws.recv(), 10))["type"] == "authenticated"
        await ws.send(json.dumps({"type": "ping"}))
        assert json.loads(await asyncio.wait_for(ws.recv(), 10))["type"] == "pong"
    print("OK: Whisper local, CORS y WebSocket autenticado. No se modificaron datos.")


if __name__ == "__main__":
    asyncio.run(run_test())
