"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  AudioLines,
  Check,
  CloudUpload,
  FileAudio,
  FileVideo,
  KeyRound,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ROUTES, MAX_UPLOAD_BYTES } from "@/lib/routes";
import type { ProcessResponse, StatusResponse, UploadResponse } from "@/lib/contracts";
import { ApiClientError, api } from "@/lib/ui/api";
import { formatClock } from "@/lib/ui/format";
import type { Capabilities, ProcessingStage } from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "idle" | "uploading" | ProcessingStage;

const STAGES: { key: Phase; label: string; hint: string }[] = [
  { key: "uploading", label: "Uploading", hint: "Sending your file to secure storage" },
  { key: "queued", label: "Queued", hint: "Waiting for a transcription worker" },
  { key: "transcribing", label: "Transcribing", hint: "Diarized speech-to-text (Deepgram nova)" },
  { key: "analyzing", label: "Writing notes", hint: "Summary, action items, chapters, highlights, meeting type" },
  { key: "ready", label: "Ready", hint: "Your call page is ready" },
];

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.send(file);
  });
}

export function UploadView({ capabilities }: { capabilities: Capabilities }) {
  const router = useRouter();
  const live = capabilities.transcription && capabilities.data_mode === "supabase";
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pick = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (!/^(audio|video)\//.test(f.type)) {
      toast.error("That doesn't look like a recording", { description: "Upload an audio or video file (mp3, m4a, wav, mp4, webm…)." });
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error("File too large", { description: `Max ${formatBytes(MAX_UPLOAD_BYTES)}.` });
      return;
    }
    setFile(f);
    setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    setDuration(null);
    setError(null);
    setPhase("idle");
    const url = URL.createObjectURL(f);
    const el = document.createElement(f.type.startsWith("video/") ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration);
      URL.revokeObjectURL(url);
    };
    el.onerror = () => URL.revokeObjectURL(url);
    el.src = url;
  }, []);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setFile(null);
    setPhase("idle");
    setUploadPct(0);
    setError(null);
    setSimulated(false);
    setMeetingId(null);
  };

  const runSimulation = () => {
    setSimulated(true);
    setError(null);
    setPhase("uploading");
    setUploadPct(0);
    const steps: [number, () => void][] = [];
    for (let i = 1; i <= 10; i++) steps.push([i * 140, () => setUploadPct(i * 10)]);
    steps.push([1600, () => setPhase("queued")]);
    steps.push([2600, () => setPhase("transcribing")]);
    steps.push([5200, () => setPhase("analyzing")]);
    steps.push([7600, () => setPhase("ready")]);
    timers.current = steps.map(([ms, fn]) => setTimeout(fn, ms));
  };

  const start = async () => {
    if (!file) return;
    if (!live) return runSimulation();
    setError(null);
    setPhase("uploading");
    try {
      const up = await api<UploadResponse>(ROUTES.api.upload, {
        method: "POST",
        json: { filename: file.name, content_type: file.type, size_bytes: file.size, title: title.trim() || undefined },
      });
      setMeetingId(up.meeting_id);
      await putWithProgress(up.signed_url, file, setUploadPct);
      const proc = await api<ProcessResponse>(ROUTES.api.process(up.meeting_id), { method: "POST", json: {} });
      setPhase(proc.stage);
      // Poll every 2s until ready/failed.
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await api<StatusResponse>(ROUTES.api.status(up.meeting_id));
        setPhase(st.stage);
        if (st.stage === "ready") {
          toast.success("Your call is ready");
          router.push(ROUTES.pages.call(up.meeting_id));
          return;
        }
        if (st.stage === "failed") throw new Error(st.error ?? "Processing failed");
      }
    } catch (e) {
      const msg =
        e instanceof ApiClientError && (e.code === "transcription_unavailable" || e.code === "storage_unavailable")
          ? `${e.message} (${e.code})`
          : e instanceof Error
            ? e.message
            : "Upload failed";
      setError(msg);
      setPhase("failed");
    }
  };

  const busy = phase !== "idle" && phase !== "failed" && phase !== "ready";
  const Icon = file?.type.startsWith("video/") ? FileVideo : FileAudio;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Upload a recording</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Drop in a meeting recording — Fanthom transcribes it with speaker labels and writes the notes.
      </p>

      {!live && <KeysNotice capabilities={capabilities} />}

      {!file ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "group relative mt-6 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed px-6 py-16 text-center transition-all",
            dragging
              ? "border-sky-400/70 bg-primary/[0.08] shadow-[0_0_60px_-20px_var(--brand)]"
              : "border-white/12 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.035]",
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.22),transparent)] blur-2xl"
          />
          <div className="relative flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sky-300 shadow-[0_0_30px_-8px_var(--brand)] transition-transform group-hover:-translate-y-0.5">
            <CloudUpload className="size-6" />
          </div>
          <p className="relative mt-4 text-base font-medium">{dragging ? "Drop to add" : "Drag & drop a recording"}</p>
          <p className="relative mt-1 text-sm text-muted-foreground">
            or <span className="text-sky-300 underline-offset-4 group-hover:underline">browse your files</span> · MP3, M4A, WAV,
            MP4, WEBM up to {formatBytes(MAX_UPLOAD_BYTES)}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,video/*"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="glass mt-6 rounded-3xl p-5">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-sky-300">
              <Icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatBytes(file.size)} · {file.type || "unknown type"}
                {duration != null && ` · ${formatClock(duration * 1000)}`}
              </p>
            </div>
            {!busy && (
              <button
                type="button"
                onClick={reset}
                aria-label="Remove file"
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {phase === "idle" || phase === "failed" ? (
            <>
              <label className="mt-5 block text-xs font-medium text-muted-foreground" htmlFor="upload-title">
                Title
              </label>
              <input
                id="upload-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="e.g. Acme discovery call"
                className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
              />
              {error && (
                <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                {!live && (
                  <span className="mr-auto text-xs text-muted-foreground">Nothing leaves your browser in preview mode.</span>
                )}
                <Button onClick={start} className="h-10 rounded-full bg-white px-5 text-neutral-950 hover:bg-white/90">
                  {live ? (
                    <>
                      <Sparkles /> Transcribe & summarize
                    </>
                  ) : (
                    <>
                      <AudioLines /> Preview the pipeline
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <Progress phase={phase} uploadPct={uploadPct} simulated={simulated} meetingId={meetingId} onReset={reset} />
          )}
        </div>
      )}

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {[
          ["Speaker-labelled transcript", "Diarized so every line has a name and a timestamp."],
          ["Notes in your template", "Sales, 1:1, stand-up and more — every bullet links to the moment."],
          ["Action items & chapters", "Owners, due dates and a chapter rail for long calls."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <p className="text-sm font-medium">{t}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeysNotice({ capabilities }: { capabilities: Capabilities }) {
  const missing = [
    !capabilities.transcription && { k: "DEEPGRAM_API_KEY", why: "speech-to-text with speaker labels" },
    capabilities.data_mode !== "supabase" && { k: "Supabase URL + service key", why: "storage for the uploaded file" },
  ].filter(Boolean) as { k: string; why: string }[];
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),rgba(251,191,36,0.02))]">
      <div className="flex items-start gap-3 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-300/15 text-amber-200">
          <KeyRound className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-50">Real transcription is switched off in this demo</p>
          <p className="mt-1 text-[13px] leading-relaxed text-amber-100/75">
            Uploading runs a real pipeline — diarized transcription, then AI notes — once the server has these keys. Until
            then you can pick a file and preview each stage; nothing is uploaded.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {missing.map((m) => (
              <li key={m.k} className="rounded-lg border border-amber-300/20 bg-black/20 px-2.5 py-1 text-xs text-amber-100/90">
                <code className="font-mono">{m.k}</code> <span className="text-amber-100/55">· {m.why}</span>
              </li>
            ))}
          </ul>
          <Link href={ROUTES.pages.calls} className="mt-3 inline-flex items-center gap-1 text-xs text-sky-300 hover:underline">
            Meanwhile, explore the seeded calls <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Progress({
  phase,
  uploadPct,
  simulated,
  meetingId,
  onReset,
}: {
  phase: Phase;
  uploadPct: number;
  simulated: boolean;
  meetingId: string | null;
  onReset: () => void;
}) {
  const idx = STAGES.findIndex((s) => s.key === phase);
  return (
    <div className="mt-6">
      {simulated && (
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-1 text-[11px] font-medium text-amber-200">
          Simulated preview — no keys configured
        </p>
      )}
      <ol className="relative space-y-4">
        {STAGES.map((s, i) => {
          const done = i < idx || phase === "ready";
          const current = i === idx && phase !== "ready";
          return (
            <li key={s.key} className="relative flex items-start gap-3">
              {i < STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={cn("absolute left-[13px] top-7 h-[calc(100%-4px)] w-px", done ? "bg-sky-400/60" : "bg-white/10")}
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs",
                  done && "border-sky-400/60 bg-primary text-white",
                  current && "border-sky-400/70 bg-primary/20 text-sky-200 shadow-[0_0_20px_-4px_var(--brand)]",
                  !done && !current && "border-white/10 bg-white/[0.03] text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : current ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={cn("text-sm", current || done ? "font-medium text-white" : "text-muted-foreground")}>
                  {s.label}
                  {s.key === "uploading" && current && <span className="ml-2 font-mono text-xs text-sky-300">{uploadPct}%</span>}
                </p>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
                {s.key === "uploading" && current && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-sky-400 transition-[width]" style={{ width: `${uploadPct}%` }} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {phase === "ready" && (
        <div className="animate-rise mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {simulated ? (
            <>
              <p className="text-sm font-medium">That’s the whole pipeline.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                With keys configured, your recording would open as a call page right here. Explore a seeded call to see the result.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild className="rounded-full bg-white text-neutral-950 hover:bg-white/90">
                  <Link href={ROUTES.pages.calls}>
                    Browse seeded calls <ArrowRight />
                  </Link>
                </Button>
                <Button variant="outline" className="rounded-full" onClick={onReset}>
                  Try another file
                </Button>
              </div>
            </>
          ) : (
            meetingId && (
              <Button asChild className="rounded-full">
                <Link href={ROUTES.pages.call(meetingId)}>
                  Open call <ArrowRight />
                </Link>
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
