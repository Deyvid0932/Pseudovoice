import { useEffect, useRef, useState } from "react";
import { tauriBridge } from "../services/tauriBridge";
import { voiceCaptureGate } from "../services/voiceCaptureGate";

export function SavedAudioButton({ turnId }: { turnId: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [savedPath, setSavedPath] = useState("");

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioRef.current) voiceCaptureGate.release(audioRef.current);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function togglePlayback() {
    setError("");
    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
        setPlaying(false);
      } else {
        try {
          if (audioRef.current.ended) audioRef.current.currentTime = 0;
          voiceCaptureGate.block(audioRef.current);
          await audioRef.current.play();
          setPlaying(true);
        }
        catch {
          voiceCaptureGate.release(audioRef.current);
          setError("No se pudo reproducir el audio en este dispositivo.");
        }
      }
      return;
    }
    setLoading(true);
    try {
      const bytes = await tauriBridge.readGeneratedAudioArchive(turnId);
      const wavBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(wavBuffer).set(bytes);
      const url = URL.createObjectURL(new Blob([wavBuffer], { type: "audio/wav" }));
      const audio = new Audio(url);
      const finishPlayback = () => { voiceCaptureGate.release(audio); setPlaying(false); };
      audio.onpause = finishPlayback;
      audio.onended = finishPlayback;
      audio.onerror = () => { finishPlayback(); setError("El archivo de audio no se puede reproducir."); };
      urlRef.current = url;
      audioRef.current = audio;
      voiceCaptureGate.block(audio);
      await audio.play();
      setPlaying(true);
    } catch (reason) {
      if (audioRef.current) voiceCaptureGate.release(audioRef.current);
      setError(reason instanceof Error ? reason.message : "No se encontró el audio local.");
    } finally { setLoading(false); }
  }

  async function downloadAudio() {
    setError("");
    setDownloading(true);
    try {
      const destination = await tauriBridge.exportGeneratedAudioArchive(turnId);
      if (destination) setSavedPath(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo descargar el audio guardado.");
    } finally { setDownloading(false); }
  }

  return <><button className="pv-saved-audio-button" type="button" onClick={() => void togglePlayback()} aria-label={playing ? "Pausar audio guardado" : "Reproducir voz"} title={playing ? "Pausar audio" : "Reproducir voz"} disabled={loading}>{loading ? "Cargando…" : playing ? "Ⅱ Pausar" : "▶ Reproducir"}</button><button className="pv-saved-audio-button" type="button" onClick={() => void downloadAudio()} aria-label="Guardar audio WAV como" title="Elegir nombre y carpeta" disabled={downloading}>{downloading ? "Guardando…" : "↓ Guardar como…"}</button>{savedPath && <span className="pv-audio-save-path" role="status" title={savedPath}>Guardado en {savedPath}</span>}{error && <span className="pv-saved-audio-error" role="status">{error}</span>}</>;
}
