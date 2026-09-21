"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CircleStop,
  Download,
  KeyRound,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress, formatBytes, putWithProgress, type Phase } from "@/components/upload/upload-view";
import { ROUTES, MAX_UPLOAD_BYTES } from "@/lib/routes";
import type { ProcessResponse, StatusResponse, UploadResponse } from "@/lib/contracts";
import { ApiClientError, api } from "@/lib/ui/api";
import { invalidate } from "@/lib/ui/use-api";
import { formatClock } from "@/lib/ui/format";
import type { Capabilities } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";

type Stage = "setup" | "recording" | "paused" | "review";
type PermState = "unknown" | "granted" | "denied" | "unsupported";

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const VIDEO_TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

function pickMime(video: boolean): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return (video ? VIDEO_TYPES : AUDIO_TYPES).find((t) => MediaRecorder.isTypeSupported(t));
}

function extFor(mime: string) {
  return mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
}

function defaultTitle() {
  return `Recording · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** Live input level meter driven by an AnalyserNode; writes straight to DOM refs (no re-render per frame). */
function useLevelMeter(stream: MediaStream | null, active: boolean) {
  const barsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const level = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-8) + 60) / 50)); // -60dB..-10dB → 0..1
      const el = barsRef.current;
      if (el) {
        const n = el.children.length;
        for (let i = 0; i < n; i++) {
          const on = i / n < level;
          (el.children[i] as HTMLElement).dataset.on = on ? (i / n > 0.8 ? "hot" : "1") : "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      void ctx.close();
    };
  }, [stream, active]);
  return barsRef;
}

export function Recorder({ capabilities }: { capabilities: Capabilities }) {
  const router = useRouter();
  const live = capabilities.transcription && capabilities.data_mode === "supabase";

  const [perm, setPerm] = useState<PermState>("unknown");
  const [permError, setPermError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [withScreen, setWithScreen] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>("setup");
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const clockRef = useRef<{ startedAt: number; accumulated: number }>({ startedAt: 0, accumulated: 0 });
  const mixCtxRef = useRef<AudioContext | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const micRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);

  const supported =
    typeof window === "undefined" ||
    (!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
  const hydrated = useHydrated();
  const screenSupported = hydrated && !!navigator.mediaDevices?.getDisplayMedia;

  // ---- device + permission handling ------------------------------------------------------------
  const stopStream = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "audioinput" && d.deviceId));
    } catch {
      /* ignore */
    }
  }, []);

  const acquireMic = useCallback(
    async (id?: string) => {
      setPermError(null);
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(id ? { deviceId: { exact: id } } : {}),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        stopStream(micRef.current);
        micRef.current = s;
        setMicStream(s);
        setPerm("granted");
        const track = s.getAudioTracks()[0];
        setDeviceId(track?.getSettings().deviceId ?? id ?? "");
        await refreshDevices();
        return s;
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setPerm("denied");
          setPermError("Microphone access was blocked.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setPermError("No microphone found. Plug one in and try again.");
        } else if (name === "NotReadableError") {
          setPermError("Your microphone is in use by another app.");
        } else {
          setPermError(e instanceof Error ? e.message : "Couldn't open the microphone.");
        }
        return null;
      }
    },
    [refreshDevices],
  );

  // Probe permission state without prompting; if already granted, open the mic for the meter.
  useEffect(() => {
    if (!supported) {
      setPerm("unsupported"); // eslint-disable-line react-hooks/set-state-in-effect -- one-time capability probe
      return;
    }
    let cancelled = false;
    const probe = async () => {
      try {
        const st = await navigator.permissions?.query({ name: "microphone" as PermissionName });
        if (cancelled || !st) return;
        if (st.state === "granted") void acquireMic();
        else if (st.state === "denied") setPerm("denied");
      } catch {
        /* Safari/Firefox may not support querying microphone */
      }
    };
    void probe();
    const onChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", onChange);
    };
  }, [supported, acquireMic, refreshDevices]);

  // Release everything on unmount.
  useEffect(
    () => () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      stopStream(micRef.current);
      stopStream(screenRef.current);
      void mixCtxRef.current?.close();
    },
    [],
  );

  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  // Warn before leaving mid-recording.
  useEffect(() => {
    if (stage !== "recording" && stage !== "paused") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [stage]);

  // Timer
  useEffect(() => {
    if (stage !== "recording") return;
    const t = setInterval(() => {
      const c = clockRef.current;
      setElapsed(c.accumulated + (Date.now() - c.startedAt));
    }, 250);
    return () => clearInterval(t);
  }, [stage]);

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = screenStream;
  }, [screenStream]);

  const meterRef = useLevelMeter(micStream, stage !== "review");

  // ---- recording -------------------------------------------------------------------------------
  const finish = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = async () => {
    setStarting(true);
    try {
      const mic = micRef.current ?? (await acquireMic(deviceId || undefined));
      if (!mic) return;
      let display: MediaStream | null = null;
      if (withScreen) {
        try {
          display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
        } catch (e) {
          const name = e instanceof DOMException ? e.name : "";
          toast.error(name === "NotAllowedError" ? "Screen sharing was cancelled" : "Couldn't capture the screen", {
            description: "Pick a tab, window or screen — or switch off “Also record screen” to record audio only.",
          });
          return;
        }
        screenRef.current = display;
        setScreenStream(display);
        display.getVideoTracks()[0]?.addEventListener("ended", () => {
          toast.info("Screen sharing stopped — recording finished.");
          finish();
        });
      }

      // Mix mic + tab/system audio into one track.
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      mixCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(mic).connect(dest);
      if (display?.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
      const tracks = [...(display?.getVideoTracks() ?? []), ...dest.stream.getAudioTracks()];
      const out = new MediaStream(tracks);

      const mime = pickMime(!!display);
      const rec = new MediaRecorder(out, mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const type = (rec.mimeType || mime || (display ? "video/webm" : "audio/webm")).split(";")[0];
        const b = new Blob(chunksRef.current, { type });
        setBlob(b);
        setBlobUrl(URL.createObjectURL(b));
        setTitle((t) => t || defaultTitle());
        setStage("review");
        stopStream(screenRef.current);
        screenRef.current = null;
        setScreenStream(null);
        void mixCtxRef.current?.close();
        mixCtxRef.current = null;
      };
      rec.onerror = () => toast.error("The recorder hit an error — what was captured so far is kept.");
      rec.start(1000);
      recorderRef.current = rec;
      clockRef.current = { startedAt: Date.now(), accumulated: 0 };
      setElapsed(0);
      setStage("recording");
    } catch (e) {
      toast.error("Couldn't start recording", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setStarting(false);
    }
  };

  const pause = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    clockRef.current.accumulated += Date.now() - clockRef.current.startedAt;
    setElapsed(clockRef.current.accumulated);
    setStage("paused");
  };
  const resume = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "paused") return;
    rec.resume();
    clockRef.current.startedAt = Date.now();
    setStage("recording");
  };
  const stop = () => {
    if (stage === "recording") clockRef.current.accumulated += Date.now() - clockRef.current.startedAt;
    setElapsed(clockRef.current.accumulated);
    finish();
  };

  const discard = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlob(null);
    setBlobUrl(null);
    setTitle("");
    setPhase("idle");
    setUploadError(null);
    setElapsed(0);
    setStage("setup");
  };

  const download = () => {
    if (!blob || !blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${(title || "fanthom-recording").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "recording"}.${extFor(blob.type)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const upload = async () => {
    if (!blob) return;
    if (blob.size > MAX_UPLOAD_BYTES) {
      toast.error("Recording too large to upload", { description: `Max ${formatBytes(MAX_UPLOAD_BYTES)} — download it instead.` });
      return;
    }
    setUploadError(null);
    setPhase("uploading");
    setUploadPct(0);
    try {
      const filename = `recording-${Date.now()}.${extFor(blob.type)}`;
      const up = await api<UploadResponse>(ROUTES.api.upload, {
        method: "POST",
        json: { filename, content_type: blob.type, size_bytes: blob.size, title: title.trim() || undefined },
      });
      setMeetingId(up.meeting_id);
      await putWithProgress(up.signed_url, blob, setUploadPct);
      const proc = await api<ProcessResponse>(ROUTES.api.process(up.meeting_id), { method: "POST", json: {} });
      setPhase(proc.stage);
      invalidate("meetings");
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await api<StatusResponse>(ROUTES.api.status(up.meeting_id));
        setPhase(st.stage);
        if (st.stage === "ready") {
          toast.success("Your recording is ready");
          invalidate("meetings", "notifications");
          router.push(ROUTES.pages.call(up.meeting_id));
          return;
        }
        if (st.stage === "failed") throw new Error(st.error ?? "Processing failed");
      }
    } catch (e) {
      setUploadError(
        e instanceof ApiClientError && (e.code === "transcription_unavailable" || e.code === "storage_unavailable")
          ? `${e.message} (${e.code}). Your recording is still here — download it to keep it.`
          : e instanceof Error
            ? e.message
            : "Upload failed",
      );
      setPhase("failed");
    }
  };

  // ---- render ----------------------------------------------------------------------------------
  if (perm === "unsupported")
    return (
      <Panel>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-medium">This browser can&apos;t record here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Recording needs microphone access over HTTPS and the MediaRecorder API (recent Chrome, Edge, Firefox or Safari). You can
              still upload a file you recorded elsewhere.
            </p>
          </div>
        </div>
      </Panel>
    );

  const recordingNow = stage === "recording" || stage === "paused";
  const deviceLabel = devices.find((d) => d.deviceId === deviceId)?.label || "Default microphone";

  if (stage === "review" && blob && blobUrl) {
    const busy = phase !== "idle" && phase !== "failed" && phase !== "ready";
    const isVideo = blob.type.startsWith("video/");
    return (
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Review your recording</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatClock(elapsed)} · {formatBytes(blob.size)} · {blob.type}
            </p>
          </div>
          {!busy && (
            <Button variant="ghost" size="sm" onClick={discard} className="text-muted-foreground">
              <Trash2 /> Discard
            </Button>
          )}
        </div>
        {isVideo ? (
          <video src={blobUrl} controls playsInline className="mt-4 aspect-video w-full rounded-2xl border border-white/10 bg-black" />
        ) : (
          <audio src={blobUrl} controls className="mt-4 w-full" />
        )}

        {phase === "idle" || phase === "failed" ? (
          <>
            <label className="mt-5 block text-xs font-medium text-muted-foreground" htmlFor="rec-title">
              Title
            </label>
            <input
              id="rec-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
            />
            {uploadError && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {uploadError}
              </p>
            )}
            {!live && (
              <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2.5 text-[13px] leading-relaxed text-amber-100/85">
                Transcription isn&apos;t configured on this deployment, so the recording can&apos;t become a call page yet. It never left
                your browser — download it to keep it, or upload it later once keys are set.
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" className="rounded-full" onClick={discard}>
                <RotateCcw /> Record again
              </Button>
              <Button variant={live ? "outline" : "default"} className="rounded-full" onClick={download}>
                <Download /> Download
              </Button>
              {live && (
                <Button onClick={upload} className="h-9 rounded-full bg-white px-4 text-neutral-950 hover:bg-white/90">
                  <Sparkles /> Transcribe & summarize
                </Button>
              )}
            </div>
          </>
        ) : (
          <Progress phase={phase} uploadPct={uploadPct} simulated={false} meetingId={meetingId} onReset={discard} />
        )}
      </Panel>
    );
  }

  return (
    <Panel>
      {/* Status + timer */}
      <div className="flex flex-col items-center py-4 text-center">
        <div
          className={cn(
            "relative flex size-20 items-center justify-center rounded-full border transition-all",
            stage === "recording"
              ? "border-red-400/40 bg-red-500/15 text-red-300 shadow-[0_0_60px_-10px_rgba(239,68,68,0.6)]"
              : stage === "paused"
                ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
                : "border-white/10 bg-white/[0.04] text-sky-300 shadow-[0_0_40px_-12px_var(--brand)]",
          )}
        >
          {stage === "recording" && <span className="absolute inset-0 animate-ping rounded-full border border-red-400/30" />}
          {perm === "denied" ? <MicOff className="size-7" /> : <Mic className="size-7" />}
        </div>
        <p className="mt-4 font-mono text-4xl font-medium tabular-nums tracking-tight" aria-live="off">
          {formatClock(elapsed)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
          {stage === "recording" ? "Recording…" : stage === "paused" ? "Paused" : perm === "granted" ? "Ready when you are" : "Microphone off"}
        </p>
        {/* Level meter */}
        <div
          ref={meterRef}
          aria-hidden
          className="mt-4 flex h-6 items-end gap-[3px] [&>span[data-on='1']]:bg-sky-400 [&>span[data-on='hot']]:bg-amber-300 [&>span]:bg-white/10"
        >
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className="w-1.5 rounded-sm transition-colors duration-75" style={{ height: `${30 + Math.sin((i / 27) * Math.PI) * 70}%` }} />
          ))}
        </div>
      </div>

      {screenStream && (
        <div className="relative mx-auto mt-2 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-black">
          <video ref={previewRef} autoPlay muted playsInline className="aspect-video w-full object-contain" />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
            <MonitorUp className="size-3" /> Screen preview
          </span>
        </div>
      )}

      {/* Permission problems */}
      {(perm === "denied" || permError) && !recordingNow && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-300" />
          <div className="text-sm">
            <p className="font-medium text-red-100">{permError ?? "Microphone access is blocked"}</p>
            {perm === "denied" && (
              <p className="mt-1 text-[13px] text-red-100/70">
                Click the lock or camera icon in your browser&apos;s address bar, allow the microphone for this site, then try again.
              </p>
            )}
            <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => void acquireMic(deviceId || undefined)}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Setup controls */}
      {stage === "setup" && (
        <div className="mt-6 grid gap-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5 text-sm">
              <Mic className="size-4 text-muted-foreground" /> Microphone
            </div>
            {perm === "granted" && devices.length > 0 ? (
              <Select
                value={deviceId}
                onValueChange={(v) => {
                  setDeviceId(v);
                  void acquireMic(v);
                }}
              >
                <SelectTrigger className="w-full sm:w-64" aria-label="Microphone">
                  <SelectValue>
                    <span className="truncate">{deviceLabel}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  {devices.map((d, i) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => void acquireMic()}>
                Allow microphone
              </Button>
            )}
          </div>
          <label
            className={cn(
              "flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3.5",
              !screenSupported && "opacity-60",
            )}
          >
            <span className="flex items-start gap-2.5 text-sm">
              <MonitorUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                Also record screen or tab
                <span className="block text-xs text-muted-foreground">
                  {screenSupported
                    ? "Share a meeting tab to capture its video and the other people's audio."
                    : "Screen capture isn't available in this browser (common on mobile)."}
                </span>
              </span>
            </span>
            <Switch checked={withScreen} onCheckedChange={setWithScreen} disabled={!screenSupported} aria-label="Also record screen or tab" />
          </label>
        </div>
      )}

      {/* Transport */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {stage === "setup" ? (
          <Button
            onClick={start}
            disabled={starting}
            className="h-11 rounded-full bg-red-500 px-6 text-white shadow-[0_0_30px_-8px_rgba(239,68,68,0.7)] hover:bg-red-500/90"
          >
            {starting ? <Loader2 className="animate-spin" /> : <span className="size-2.5 rounded-full bg-white" />} Start recording
          </Button>
        ) : (
          <>
            {stage === "recording" ? (
              <Button variant="outline" onClick={pause} className="h-11 rounded-full px-5">
                <Pause /> Pause
              </Button>
            ) : (
              <Button variant="outline" onClick={resume} className="h-11 rounded-full px-5">
                <Play /> Resume
              </Button>
            )}
            <Button onClick={stop} className="h-11 rounded-full bg-white px-5 text-neutral-950 hover:bg-white/90">
              <CircleStop /> Stop & review
            </Button>
          </>
        )}
      </div>
      {!live && stage === "setup" && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-3.5">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-200" />
          <p className="text-[13px] leading-relaxed text-amber-100/80">
            Transcription is switched off on this deployment. You can still record, play back and download — turning a recording
            into a call page needs <code className="font-mono text-amber-100">DEEPGRAM_API_KEY</code>
            {capabilities.data_mode !== "supabase" && (
              <>
                {" "}and Supabase storage
              </>
            )}
            .
          </p>
        </div>
      )}
      {stage === "setup" && (
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Recording stays in your browser until you choose to upload it. Let everyone in the conversation know they&apos;re being recorded.
        </p>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="glass rounded-3xl p-5 md:p-6">{children}</div>;
}
