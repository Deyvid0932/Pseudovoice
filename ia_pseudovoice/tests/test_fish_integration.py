"""Offline Fish regressions: real codecs, mocked HTTP, no paid requests."""
import io
import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import Mock, patch

import av
import httpx
import numpy as np
from fastapi import HTTPException

from pseudovoice import engine, fish_service as fish, server
from pseudovoice.config import Settings


VOICE = "voice_123456789"
HTTP_CLIENT = httpx.Client


def audio_fixture(container="wav", seconds=1.5, silence=False):
    """Encode a genuine stereo 48 kHz signal using PyAV, including encoder flush."""
    samples = np.arange(int(48000 * seconds))
    signal = np.zeros(len(samples), dtype=np.int16) if silence else (
        8000 * np.sin(2 * np.pi * 440 * samples / 48000)).astype(np.int16)
    frame = av.AudioFrame.from_ndarray(np.stack([signal, signal]).reshape(1, -1, order="F"),
                                     format="s16", layout="stereo")
    frame.sample_rate = 48000
    output = io.BytesIO()
    with av.open(output, "w", format=container) as encoder:
        stream = encoder.add_stream("libmp3lame" if container == "mp3" else "pcm_s16le", rate=48000)
        stream.layout = "stereo"
        for packet in stream.encode(frame):
            encoder.mux(packet)
        for packet in stream.encode(None):
            encoder.mux(packet)
    return output.getvalue()


class FishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        for field, value in (("DATA_DIR", self.folder), ("VOICES_DIR", self.folder),
                             ("FISH_AUDIO_API_KEY", "offline-test-key"), ("FISH_AUDIO_MODEL", "s2.1-pro")):
            patcher = patch.object(fish.settings, field, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        fish._catalog_cache.clear()
        self.addCleanup(fish._catalog_cache.clear)
        # An unconfigured provider call fails immediately; every test must explicitly mock HTTP.
        guard = patch.object(fish.httpx.Client, "request", side_effect=AssertionError("Unexpected external HTTP"))
        guard.start()
        self.addCleanup(guard.stop)

    def provider(self, handler):
        factory = patch.object(fish.httpx, "Client", return_value=httpx.Client(transport=httpx.MockTransport(handler)))
        factory.start()
        self.addCleanup(factory.stop)

    def test_headers_and_env_alias(self):
        self.assertEqual(fish.headers(), {"Authorization": "Bearer offline-test-key", "model": "s2.1-pro"})
        with patch.dict("os.environ", {"FISH_AUDIO": "alias-key"}, clear=True):
            self.assertEqual(Settings(_env_file=None).FISH_AUDIO_API_KEY, "alias-key")
        with patch.object(fish.settings, "FISH_AUDIO_API_KEY", ""):
            with self.assertRaises(fish.FishError) as error:
                fish.headers()
            self.assertEqual(error.exception.status, 503)
        with patch.object(fish.settings, "FISH_AUDIO_MODEL", "unknown"):
            with self.assertRaises(fish.FishError):
                fish.headers()

    def test_catalog_filters_private_and_taken_down_and_caches(self):
        calls = []
        def handler(request):
            calls.append(request)
            self.assertEqual(request.url.path, "/model")
            self.assertEqual(request.url.params["self"], "false")
            self.assertEqual(request.url.params["language"], "es")
            return httpx.Response(200, json={"items": [
                {"_id": VOICE, "title": "Public", "visibility": "public", "state": "trained",
                 "cover_image": "coverimage/avatar_123", "samples": [{"audio": "https://example.test/a.mp3"}]},
                {"_id": "private_voice", "visibility": "private"},
                {"_id": "removed_voice", "visibility": "public", "dmca_taken_down": True},
                {"_id": "unknown_voice"}], "total": 4, "has_more": False})
        self.provider(handler)
        # Override the fail-closed guard only with the genuine MockTransport request method.
        with patch.object(HTTP_CLIENT, "request", FishTests.original_request):
            first = fish.catalog("Public", "es", 1)
            self.assertEqual(first, fish.catalog("Public", "es", 1))
        self.assertEqual([item["id"] for item in first["items"]], [VOICE])
        self.assertEqual(first["items"][0]["sample_url"], "https://example.test/a.mp3")
        self.assertEqual(first["items"][0]["avatar_url"], "https://public-platform.r2.fish.audio/coverimage/avatar_123")
        self.assertEqual(first["items"][0]["state"], "trained")
        self.assertEqual(len(calls), 1)

    def test_api_errors_are_mapped_without_leaking_provider_body(self):
        for status, message in ((400, "parámetros"), (401, "clave"), (402, "Saldo"),
                                (403, "permite"), (404, "disponible"), (422, "audio"),
                                (429, "concurrencia"), (500, "temporalmente")):
            with self.subTest(status=status):
                with self.assertRaises(fish.FishError) as error:
                    fish.check(httpx.Response(status, text="secret-provider-body"))
                self.assertEqual(error.exception.status, status)
                self.assertIn(message, str(error.exception))
                self.assertNotIn("secret-provider-body", str(error.exception))
                self.assertEqual(server.fish_http_error(error.exception).status_code, status)

    def test_request_transport_error_maps_to_502(self):
        self.provider(lambda request: (_ for _ in ()).throw(httpx.ConnectError("secret", request=request)))
        with patch.object(HTTP_CLIENT, "request", FishTests.original_request):
            with self.assertRaises(fish.FishError) as error:
                fish.request("GET", "/model")
        self.assertEqual(error.exception.status, 502)
        self.assertNotIn("secret", str(error.exception))

    def test_create_private_voice_multipart_and_headers(self):
        wav = audio_fixture()
        def handler(request):
            self.assertEqual(request.method, "POST")
            self.assertEqual(request.url.path, "/model")
            self.assertEqual(request.headers["authorization"], "Bearer offline-test-key")
            self.assertEqual(request.headers["model"], "s2.1-pro")
            body = request.read()
            for part in (b'name="voices"', b'filename="reference.wav"', b'name="visibility"\r\n\r\nprivate',
                         b'name="generate_sample"\r\n\r\nfalse', wav):
                self.assertIn(part, body)
            return httpx.Response(200, json={"_id": VOICE, "state": "created"})
        self.provider(handler)
        with patch.object(HTTP_CLIENT, "request", FishTests.original_request):
            self.assertEqual(fish.create_voice(wav, "Voz")["_id"], VOICE)

    def test_mp3_and_wav_decode_to_mono_24khz_pcm(self):
        for container in ("mp3", "wav"):
            with self.subTest(container=container):
                normalized, duration = fish.normalize_audio(audio_fixture(container))
                with wave.open(io.BytesIO(normalized)) as wav:
                    self.assertEqual((wav.getnchannels(), wav.getsampwidth(), wav.getframerate()), (1, 2, 24000))
                    pcm = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2")
                self.assertAlmostEqual(duration, 1.5, delta=0.1)
                self.assertGreater(float(np.sqrt(np.mean(pcm.astype(float) ** 2))), 1000)

    def test_corrupt_silence_short_and_overlong_audio_rejected(self):
        for contents, message in ((b"RIFF\0invalid", ".+"), (audio_fixture(silence=True), "silencio"),
                                  (audio_fixture(seconds=0.5), "segundo"), (audio_fixture(seconds=181), "tres minutos")):
            with self.subTest(message=message):
                with self.assertRaisesRegex(ValueError, message):
                    fish.normalize_audio(contents)

    def test_old_profiles_require_reassignment_without_clone(self):
        local = engine.InferenceEngine.__new__(engine.InferenceEngine)
        with patch.object(fish, "create_voice") as clone:
            for reference in ("sample.wav", "elevenlabs:" + VOICE, "../sample.wav"):
                with self.subTest(reference=reference):
                    with self.assertRaisesRegex(ValueError, "Elige una"):
                        local.get_reference_audio_path(reference)
            clone.assert_not_called()
        self.assertEqual(local.get_reference_audio_path("fish:" + VOICE), "fish:" + VOICE)

    def test_pcm_validation_prevents_usage_for_failed_synthesis(self):
        for pcm in (b"", b"\x01"):
            with self.subTest(pcm=pcm), patch.object(fish, "request", return_value=httpx.Response(200, content=pcm)):
                with self.assertRaises(fish.FishError):
                    fish.synthesize("Hola", VOICE)
        self.assertFalse((self.folder / "fish_usage.jsonl").exists())

    def test_cache_identity_includes_voice_model_and_text(self):
        local = engine.InferenceEngine.__new__(engine.InferenceEngine)
        with patch.object(engine, "synthesize", return_value=b"\x01\x00" * 10) as synth:
            local.synthesize_cached_reply("Hola", "fish:" + VOICE)
            local.synthesize_cached_reply("Hola", "fish:" + VOICE)
            self.assertEqual(synth.call_count, 1)
            local.synthesize_cached_reply("Otro texto", "fish:" + VOICE)
            local.synthesize_cached_reply("Hola", "fish:another_voice_123")
            with patch.object(fish.settings, "FISH_AUDIO_MODEL", "s2-pro"):
                local.synthesize_cached_reply("Hola", "fish:" + VOICE)
            self.assertEqual(synth.call_count, 4)

    def test_private_voice_ownership_denies_other_users(self):
        server.clone_metadata_path(VOICE).write_text(json.dumps({"user_id": 7}), encoding="utf-8")
        with patch.object(fish, "model", return_value={"visibility": "private"}) as model:
            with self.assertRaises(HTTPException) as error:
                server.authorize_model(VOICE, 8)
            self.assertEqual(error.exception.status_code, 403)
            model.assert_not_called()
            self.assertEqual(server.authorize_model(VOICE, 7)["visibility"], "private")

    original_request = httpx.Client.request


class FishEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        for target, field, value in ((server, "resolve_user", 7), (server.settings, "INFERENCE_ACCESS_KEY", ""),
                                     (fish.settings, "DATA_DIR", self.folder), (fish.settings, "VOICES_DIR", self.folder),
                                     (fish.settings, "FISH_AUDIO_API_KEY", "offline"), (fish.settings, "FISH_AUDIO_MODEL", "s2.1-pro")):
            patcher = patch.object(target, field, return_value=value) if field == "resolve_user" else patch.object(target, field, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        guard = patch.object(httpx.Client, "request", side_effect=AssertionError("Unexpected external HTTP"))
        guard.start()
        self.addCleanup(guard.stop)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://test")
        self.addAsyncCleanup(self.client.aclose)

    async def test_upload_normalizes_and_persists_owner(self):
        local = Mock()
        local.transcribe.return_value = "Una muestra de voz"
        with patch.object(server, "engine", local), patch.object(fish, "create_voice", return_value={"_id": VOICE}) as create:
            response = await self.client.post("/voices/sample.mp3", files={"file": ("sample.mp3", audio_fixture("mp3"), "audio/mpeg")})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["reference_audio_path"], "fish:" + VOICE)
        self.assertEqual(response.json()["provider"], "fish")
        with wave.open(io.BytesIO(create.call_args.args[0])) as wav:
            self.assertEqual(wav.getframerate(), 24000)
        self.assertEqual(json.loads(server.clone_metadata_path(VOICE).read_text())["user_id"], 7)
        local.transcribe.assert_called_once()

    async def test_invalid_or_non_speech_upload_never_creates_model(self):
        local = Mock()
        local.transcribe.return_value = ""
        with patch.object(server, "engine", local), patch.object(fish, "create_voice") as create:
            for contents in (b"invalid", audio_fixture(silence=True), audio_fixture()):
                response = await self.client.post("/voices/sample.wav", files={"file": ("sample.wav", contents, "audio/wav")})
                self.assertEqual(response.status_code, 400, response.text)
            create.assert_not_called()

    async def test_preview_cache_and_usage_only_on_real_synthesis(self):
        local = engine.InferenceEngine.__new__(engine.InferenceEngine)
        calls = []
        pcm = b"\x01\x00" * 24000
        def handler(request):
            calls.append(request)
            self.assertEqual(request.url.path, "/v1/tts")
            payload = json.loads(request.content)
            self.assertEqual(payload["format"], "pcm")
            self.assertEqual(payload["sample_rate"], 24000)
            self.assertEqual(payload["reference_id"], VOICE)
            return httpx.Response(200, content=pcm)
        provider_client = httpx.Client(transport=httpx.MockTransport(handler))
        with patch.object(server, "engine", local), patch.object(server, "authorize_model") as authorize, \
             patch.object(fish.httpx, "Client", return_value=provider_client), \
             patch.object(type(provider_client), "request", FishTests.original_request):
            for _ in range(2):
                response = await self.client.post("/voices/preview", json={"voice_id": VOICE, "text": "¡Hola!"})
                self.assertEqual(response.status_code, 200, response.text)
                with wave.open(io.BytesIO(response.content)) as wav:
                    self.assertEqual(wav.readframes(wav.getnframes()), pcm)
            self.assertEqual(authorize.call_count, 2)
        self.assertEqual(len(calls), 1)
        usage = [json.loads(line) for line in (self.folder / "fish_usage.jsonl").read_text().splitlines()]
        self.assertEqual(len(usage), 1)
        self.assertEqual(usage[0]["input_utf8_bytes"], len("¡Hola!".encode()))
        self.assertEqual(usage[0]["audio_seconds"], 1)
        self.assertEqual(usage[0]["billing"], "local_usage_estimate")

    async def test_catalog_endpoint_preserves_provider_status(self):
        for status in (401, 402, 403, 429, 502):
            with patch.object(fish, "catalog", side_effect=fish.FishError(status, "Mapped Fish error")):
                response = await self.client.get("/voices/catalog")
                self.assertEqual(response.status_code, status)

    async def test_status_queries_model_endpoint_for_owned_private_voice(self):
        server.clone_metadata_path(VOICE).write_text(json.dumps({"user_id": 7}), encoding="utf-8")
        with patch.object(fish, "request", return_value=httpx.Response(200, json={"visibility": "private", "state": "trained"})) as request:
            response = await self.client.get("/voices/status/" + VOICE)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"id": VOICE, "state": "trained"})
        request.assert_called_once_with("GET", "/model/" + VOICE)

    async def test_upload_extension_size_and_engine_validation_before_clone(self):
        with patch.object(server, "engine", Mock()), patch.object(fish, "create_voice") as create:
            response = await self.client.post("/voices/sample.txt", files={"file": ("sample.txt", b"text", "text/plain")})
            self.assertEqual(response.status_code, 400)
            response = await self.client.post("/voices/sample.wav", files={"file": ("sample.wav", b"0" * (20 * 1024 * 1024 + 1), "audio/wav")})
            self.assertEqual(response.status_code, 413)
            create.assert_not_called()
        with patch.object(server, "engine", None), patch.object(fish, "create_voice") as create:
            response = await self.client.post("/voices/sample.wav", files={"file": ("sample.wav", audio_fixture(), "audio/wav")})
            self.assertEqual(response.status_code, 503)
            create.assert_not_called()


if __name__ == "__main__":
    unittest.main()
