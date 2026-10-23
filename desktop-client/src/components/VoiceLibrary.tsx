import { useEffect, useRef, useState } from "react";
import { aiInferenceService, type CatalogVoice } from "../services/aiInferenceService";
import { tauriBridge } from "../services/tauriBridge";
import { createAvatarDataUrl } from "../lib/avatarImage";

export function VoiceLibrary({ onClose, onUpload, onChoose, initialName = "", reassigning = false }: {
  initialName?: string;
  reassigning?: boolean;
  onClose: () => void;
  onUpload: (name: string, file: File, avatar?: string) => Promise<void>;
  onChoose: (name: string, voice: CatalogVoice) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement>(null);
  const recordingRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const [tab, setTab] = useState<"catalog" | "upload">("catalog");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CatalogVoice[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<CatalogVoice | null>(null);
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sampleSource, setSampleSource] = useState<"upload" | "record" | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const [preview, setPreview] = useState<{ url: string; voiceId: string } | null>(null);
  const [text, setText] = useState("Hola, me alegra conversar contigo. ¿Cómo estuvo tu día?");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tab !== "catalog") return;
    const controller = new AbortController();
    setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      void aiInferenceService.getCatalog(query, language, page, controller.signal)
        .then(result => { setItems(result.items); setHasMore(result.has_more); setTotal(result.total); })
        .catch(reason => { if (!controller.signal.aborted) { setItems([]); setError(String(reason)); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, language, page, tab]);
  useEffect(() => {
    setDuration(null);
    if (!file) { setFileUrl(""); return; }
    const url = URL.createObjectURL(file); setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => () => {
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
  }, []);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    return () => {
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);

  async function save() {
    setBusy(true); setError("");
    try {
      if (tab === "catalog" && selected) await onChoose(name, selected);
      else if (tab === "upload" && file) await onUpload(name, file, avatarUrl ?? undefined);
      else throw new Error("Selecciona una voz o una muestra de audio.");
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function startRecording() {
    setError("");
    setFile(null);
    setSamplePlaying(false);
    try {
      await tauriBridge.startVoiceSampleRecording();
      recordingStartedAtRef.current = Date.now();
      recordingRef.current = true;
      setRecordingSeconds(0);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
        setRecordingSeconds(seconds);
        if (seconds >= 20) void stopRecording();
      }, 250);
    } catch (reason) {
      recordingRef.current = false;
      setRecording(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setRecording(false);
    try {
      const samples = await tauriBridge.stopVoiceSampleRecording();
      if (samples.length < 16_000) throw new Error("La muestra quedó muy corta. Graba al menos un segundo de voz clara.");
      let peak = 0;
      let energy = 0;
      for (const value of samples) {
        const magnitude = Math.abs(value);
        peak = Math.max(peak, magnitude);
        energy += value * value;
      }
      const rms = Math.sqrt(energy / samples.length);
      if (peak < 160 || rms < 45) throw new Error("La grabación quedó casi en silencio. Comprueba el micrófono de entrada de Windows, acércate y vuelve a grabar.");
      // Bring quiet Windows microphone captures to a comfortable playback level
      // while bounding gain so near-silence cannot turn into loud noise.
      const gain = Math.min(20, 28_000 / peak);
      const buffer = new ArrayBuffer(44 + samples.length * 2);
      const view = new DataView(buffer);
      const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
      write(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); write(8, "WAVE"); write(12, "fmt ");
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 16_000, true); view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      write(36, "data"); view.setUint32(40, samples.length * 2, true);
      for (let index = 0; index < samples.length; index++) {
        view.setInt16(44 + index * 2, Math.max(-32768, Math.min(32767, Math.round(samples[index] * gain))), true);
      }
      setFile(new File([buffer], `muestra-${Date.now()}.wav`, { type: "audio/wav" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return <div className="pv-overlay">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="voice-library-title" className="pv-dialog pv-library">
      <header className="pv-dialog-header"><div><p className="pv-eyebrow">Tu próximo personaje</p><h2 id="voice-library-title">Biblioteca de voces</h2></div><button disabled={busy} onClick={onClose} aria-label="Cerrar biblioteca">×</button></header>
      <div className="pv-tabs"><button aria-pressed={tab === "catalog"} disabled={busy} onClick={() => { setTab("catalog"); setError(""); }}>Catálogo Fish</button><button aria-pressed={tab === "upload"} disabled={busy} onClick={() => { setTab("upload"); setError(""); }}>Subir muestra</button></div>
      <div className="pv-dialog-body">
        <label>Nombre del personaje<input autoFocus maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="El nombre que tú elijas" /></label>
        {tab === "catalog" ? <>
          <div className="pv-form-row"><label>Buscar voz<input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Nombre o descripción" /></label><label>Idioma<select value={language} onChange={event => { setLanguage(event.target.value); setPage(1); }}><option value="">Todos</option><option value="es">Español</option><option value="en">Inglés</option><option value="ja">Japonés</option><option value="zh">Chino</option><option value="pt">Portugués</option></select></label></div>
          <p className="pv-muted">{loading ? "Consultando catálogo…" : `${total} voces · página ${page}`}</p>
          <div className="pv-catalog" aria-busy={loading}>
            {!loading && !items.length && !error && <p>No hay voces para esta búsqueda.</p>}
            {items.map(voice => <button key={voice.id} className="pv-voice-card" aria-pressed={selected?.id === voice.id} disabled={busy || loading} onClick={() => { setSelected(voice); if (!name.trim()) setName(voice.name); }}>
              {voice.avatar_url ? <img src={voice.avatar_url} alt="" loading="lazy" /> : <span className="pv-initial">{voice.name.slice(0, 1)}</span>}
              <span><strong>{voice.name}</strong><small>{voice.languages.join(" · ")} · {voice.state}</small><small>{voice.description}</small></span>
            </button>)}
          </div>
          <div className="pv-actions"><button disabled={page <= 1 || loading || busy} onClick={() => setPage(value => value - 1)}>Anterior</button><button disabled={!hasMore || loading || busy} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>
          {selected && <div className="pv-preview"><p>Voz original: <strong>{selected.name}</strong></p>{selected.sample_url && <div><p className="pv-muted">Muestra del catálogo (sin generar audio nuevo)</p><audio controls preload="none" src={selected.sample_url} /></div>}<label>Texto de prueba<textarea maxLength={500} value={text} onChange={event => setText(event.target.value)} /></label><button disabled={busy || !text.trim()} onClick={async () => {
            setBusy(true); setError("");
            try { const blob = await aiInferenceService.previewVoice(selected.id, text.trim()); setPreview({ url: URL.createObjectURL(blob), voiceId: selected.id }); }
            catch (reason) { setError(String(reason)); } finally { setBusy(false); }
          }}>Generar prueba de voz (usa créditos)</button>{preview?.voiceId === selected.id && <audio controls src={preview.url} />}</div>}
        </> : <>
          <p className="pv-muted">Usa una voz propia o autorizada. Fish Audio generará la voz tanto desde un archivo como desde una grabación.</p>
          <div className="pv-tabs" role="group" aria-label="Origen de la muestra">
            <button type="button" aria-pressed={sampleSource === "upload"} disabled={busy || recording} onClick={() => { setSampleSource("upload"); setFile(null); setError(""); }}>Subir archivo</button>
            <button type="button" aria-pressed={sampleSource === "record"} disabled={busy || recording} onClick={() => { setSampleSource("record"); setFile(null); setError(""); }}>Grabar audio</button>
          </div>
          {!reassigning && <section className="pv-character-photo-upload" aria-label="Foto del personaje">
            <label>Foto del personaje (opcional)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || processingAvatar} onChange={async event => {
              const image = event.target.files?.[0];
              if (!image) return;
              setError(""); setProcessingAvatar(true); setAvatarUrl(null);
              try { setAvatarUrl(await createAvatarDataUrl(image)); }
              catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); event.target.value = ""; }
              finally { setProcessingAvatar(false); }
            }} /></label>
            <p className="pv-muted">JPG, PNG, WebP o GIF · máximo 10 MB. Se recorta y comprime para el avatar.</p>
            {processingAvatar && <p className="pv-muted" role="status">Procesando foto…</p>}
            {avatarUrl && <div className="pv-character-photo-preview"><img src={avatarUrl} alt={`Vista previa de ${name || "tu personaje"}`} /><div><strong>Foto lista</strong><small>Se guardará junto con el personaje.</small></div><button type="button" disabled={busy} onClick={() => setAvatarUrl(null)}>Quitar</button></div>}
          </section>}
          {sampleSource === "upload" && <label>Archivo de audio<input type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" onChange={event => {
            const next = event.target.files?.[0] ?? null; setError("");
            if (next && (!/\.(wav|mp3)$/i.test(next.name) || next.size > 20 * 1024 * 1024)) { setFile(null); setError("Selecciona un WAV o MP3 de hasta 20 MB."); return; }
            setFile(next);
          }} /></label>}
          {sampleSource === "record" && <section className="pv-recording-panel" aria-label="Grabación de muestra">
            <div className={`pv-recording-indicator${recording ? " is-recording" : ""}`} role="status"><span aria-hidden="true">{recording ? "●" : file ? "✓" : "🎙"}</span><strong>{recording ? `Grabando ${recordingSeconds}s / 20s` : file ? "Muestra lista para escuchar" : "Graba una muestra con tu micrófono"}</strong></div>
            {recording && <div className="pv-recording-wave" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ animationDelay: `${(index % 9) * -0.13}s` }} />)}</div>}
            {!recording && !file && <p className="pv-muted">Habla con claridad durante 6–15 segundos en un lugar silencioso.</p>}
            <div className="pv-actions">{recording ? <button type="button" className="pv-primary" onClick={stopRecording}>■ Terminar grabación</button> : <button type="button" disabled={busy} onClick={() => void startRecording()}>{file ? "↻ Grabar de nuevo" : "● Empezar a grabar"}</button>}</div>
          </section>}
          {fileUrl && file && <div className="pv-preview"><p className="pv-muted">Escucha la muestra antes de enviarla a Fish Audio:</p><audio ref={sampleAudioRef} controls src={fileUrl} onPlay={() => setSamplePlaying(true)} onPause={() => setSamplePlaying(false)} onEnded={() => setSamplePlaying(false)} onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onError={() => setError("No se pudo reproducir esta muestra.")} /><button type="button" onClick={() => {
            const player = sampleAudioRef.current;
            if (!player) return;
            if (player.paused) void player.play().catch(() => setError("Windows no pudo reproducir el WAV. Vuelve a grabar la muestra."));
            else player.pause();
          }}>{samplePlaying ? "Ⅱ Pausar muestra" : "▶ Escuchar muestra"}</button><p className="pv-muted">{file.name} · {duration !== null && Number.isFinite(duration) ? `${duration.toFixed(1)} segundos` : "Leyendo duración…"}</p></div>}
        </>}
        {error && <p role="alert" className="pv-error">{error}</p>}
      </div>
      <footer className="pv-actions"><button disabled={busy || processingAvatar || recording} onClick={onClose}>Cancelar</button><button className="pv-primary" disabled={busy || processingAvatar || recording || !name.trim() || (tab === "catalog" ? !selected : !file)} onClick={() => void save()}>{processingAvatar ? "Procesando foto…" : busy ? "Generando voz con Fish Audio…" : reassigning ? "Reasignar voz" : "Generar voz y crear personaje"}</button></footer>
    </section>
  </div>;
}
