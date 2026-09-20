"use client";

type ProgressEvent = { phase: string; message: string; detail?: string };

export default function ProgressFeed({ events, busy }: { events: ProgressEvent[]; busy: boolean }) {
  const shown = events.slice(-5);
  return (
    <div className="flex flex-col gap-1.5">
      {shown.map((e, i) => (
        <div key={i} className={`flex items-start gap-2 text-xs ${i === shown.length - 1 && busy ? "text-ink" : "text-muted"}`}>
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${i === shown.length - 1 && busy ? "bg-accent pulse-soft" : "bg-line"}`} />
          <span>
            {e.message}
            {e.detail ? <span className="ml-1 text-muted">· {e.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}