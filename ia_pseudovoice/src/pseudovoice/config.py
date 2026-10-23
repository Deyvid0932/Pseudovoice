"""Configuration for the local voice service; credentials stay at the project root."""

import os
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = PROJECT_ROOT.parent
DATA_ROOT = Path(os.getenv("DATA_DIR", str(PROJECT_ROOT / "runtime"))).resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPOSITORY_ROOT / ".env", extra="ignore")

    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEVICE: str = "cpu"
    COMPUTE_TYPE: str = "int8"
    CPU_THREADS: int = Field(default=min(4, os.cpu_count() or 4), ge=1)
    DATA_DIR: Path = DATA_ROOT
    WHISPER_MODEL_DIR: Path = DATA_ROOT / "models" / "whisper"
    EMBEDDING_MODEL_DIR: Path = DATA_ROOT / "models" / "embeddings"
    VOICES_DIR: Path = DATA_ROOT / "voices"
    # Preserve pending messages that were already stored on this PC.
    SPOOL_DIR: Path = PROJECT_ROOT / "spool"
    WHISPER_MODEL_SIZE: str = "base"
    EMBEDDING_MODEL: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    TTS_LANGUAGE: str = "es"
    STT_LANGUAGE: str = "es"
    STT_MODE: str = "local"  # Set to hybrid to explicitly enable audio uploads to Groq.
    GROQ_API_KEY: str = ""
    GROQ_STT_MODEL: str = "whisper-large-v3-turbo"
    STT_CLOUD_TIMEOUT_SECONDS: float = 5.0
    STT_CLOUD_COOLDOWN_SECONDS: float = 30.0
    STT_BASE_VOCABULARY: str = "UTP, Rem, Kaoruko, Deyvi, PseudoVoice"
    STT_MAX_TERMS: int = 30
    STT_MAX_VOCABULARY_CHARS: int = 600
    STT_ASSISTANT_CONTEXT_CHARS: int = 250
    STT_COMMAND_MIN_LOGPROB: float = -1.0
    SPEECH_CONTEXT_TTL_SECONDS: float = 30.0
    VAD_THRESHOLD: float = 0.5
    VAD_STRONG_THRESHOLD: float = 0.7
    VAD_PRE_ROLL_MS: int = 300
    VAD_SILENCE_MS: int = 1500
    VAD_MIN_SPEECH_MS: int = 250
    VAD_SHORT_SPEECH_MS: int = 100
    VAD_ECHO_GUARD_MS: int = 200

    FISH_AUDIO_API_KEY: str = Field(default="", validation_alias=AliasChoices("FISH_AUDIO_API_KEY", "FISH_AUDIO"))
    FISH_AUDIO_MODEL: str = "s2.1-pro-free"
    FISH_AUDIO_USD_PER_MILLION_UTF8_BYTES: float = Field(default=0.0, ge=0)
    FISH_AUDIO_BASE_URL: str = "https://api.fish.audio"
    REPLY_MAX_TOKENS: int = Field(default=160, ge=40, le=1000)
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_INPUT_USD_PER_MILLION_TOKENS: float = Field(default=0.0, ge=0)
    DEEPSEEK_OUTPUT_USD_PER_MILLION_TOKENS: float = Field(default=0.0, ge=0)
    PLAYWRIGHT_MCP_URL: str = "http://localhost:8931/mcp"
    AGENT_APPROVAL_POLL_SECONDS: float = Field(default=1.0, ge=0.25, le=5)
    MEMORY_EXTRACTION_BATCH_TURNS: int = Field(default=6, ge=2, le=30)
    MEMORY_EXTRACTION_IDLE_SECONDS: int = Field(default=120, ge=30, le=900)
    MEMORY_EXTRACTION_MAX_INPUT_CHARS: int = Field(default=10000, ge=2000, le=30000)
    MEMORY_INPUT_USD_PER_MILLION_TOKENS: float = Field(default=0.0, ge=0)
    MEMORY_OUTPUT_USD_PER_MILLION_TOKENS: float = Field(default=0.0, ge=0)

    BACKEND_API_URL: str = "http://127.0.0.1:8081/api"
    INTERNAL_SERVICE_KEY: str = "pv-internal-key-9988"
    INFERENCE_ACCESS_KEY: str = ""
    CORS_ORIGINS: str = "http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,http://tauri.localhost,https://tauri.localhost"
    AUDIO_SAMPLE_RATE: int = 16000
    AUDIO_CHANNELS: int = 1


settings = Settings()


