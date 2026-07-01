import { JOBS, STATIONS, stationIndex, statusColor, type Job } from "@/lib/jigit-data";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

// "The Rail" — horizontal pipeline; each active job is a dot moving along
// labeled stations. The approval gate visually closes when something is pending.
export function PipelineRail() {
  const jobs = useMemo(
    () => JOBS.filter(j => !["done", "failed", "stopped"].includes(j.status)),
    []
  );
  const gateIdx = STATIONS.findIndex(s => s.key === "awaiting_approval");
  const gateActive = jobs.some(j => j.status === "awaiting_approval");
  const [hover, setHover] = useState<Job | null>(null);

  return (
    <div className="rounded-xl border border-hairline bg-surface px-6 pt-7 pb-8 relative">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal/50 to-transparent" />
      <div className="flex items-baseline justify-between mb-7">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            pipeline
          </div>
          <h1 className="text-2xl font-semibold mt-1 tracking-tight">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"} on the line
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-4 mono text-[11px] text-muted-foreground">
          <Legend swatch="teal" label="running" />
          <Legend swatch="amber" label="awaiting human" />
          <Legend swatch="moss" label="done" />
          <Legend swatch="brick" label="failed" />
        </div>
      </div>

      <div className="relative pt-2 pb-4">
        {/* Rail track row — fixed height so labels live below, dots stay on the line. */}
        <div className="relative h-8">
          <svg
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full h-6 overflow-visible"
            viewBox="0 0 1000 24"
            preserveAspectRatio="none"
          >
            <line
              x1="0"
              y1="12"
              x2="1000"
              y2="12"
              stroke="var(--rail)"
              strokeWidth="2"
              className="draw-rail"
            />
          </svg>

          {/* Station bullets, centered on rail */}
          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${STATIONS.length}, 1fr)` }}
          >
            {STATIONS.map((s, i) => {
              const isGate = s.key === "awaiting_approval";
              return (
                <div key={s.key} className="flex items-center justify-center">
                  {isGate ? (
                    <Gate active={gateActive} />
                  ) : (
                    <span
                      className={`h-3 w-3 rounded-full border bg-background ${
                        i === 0
                          ? "border-teal"
                          : i === STATIONS.length - 1
                            ? "border-moss"
                            : "border-hairline"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Job dots on the rail */}
          <div className="absolute inset-0 pointer-events-none">
            {jobs.map((j, idx) => {
              const i = stationIndex(j.status);
              const colW = 100 / STATIONS.length;
              const offset = (idx % 3 - 1) * (colW * 0.22);
              const left = colW * i + colW / 2 + offset;
              const color = statusColor(j.status);
              return (
                <Link
                  key={j.id}
                  to="/jobs/$id"
                  params={{ id: j.id }}
                  onMouseEnter={() => setHover(j)}
                  onMouseLeave={() => setHover(h => (h?.id === j.id ? null : h))}
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 glide focus:outline-none z-20"
                  style={{ left: `${left}%`, top: "50%" }}
                  aria-label={`Job ${j.issueKey} — ${j.status}`}
                >
                  <span
                    className={`block h-3.5 w-3.5 rounded-full ring-4 ring-surface bg-${color} ${
                      j.status === "awaiting_approval" ? "pulse-amber" : ""
                    }`}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Station labels — separate row, never overlaps the rail or dots */}
        <div
          className="grid mt-5"
          style={{ gridTemplateColumns: `repeat(${STATIONS.length}, 1fr)` }}
        >
          {STATIONS.map(s => {
            const isGate = s.key === "awaiting_approval";
            return (
              <div
                key={s.key}
                className={`mono text-[10px] tracking-wider uppercase text-center px-1 leading-tight ${
                  isGate && gateActive ? "text-amber" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </div>
            );
          })}
        </div>

        {/* Hover preview card — high z, allowed to escape via parent overflow-visible */}
        {hover && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-3 z-50 w-[320px] rounded-lg border border-hairline bg-surface-2 shadow-2xl p-3 pointer-events-none"
            role="tooltip"
          >
            <div className="flex items-center justify-between">
              <span className="mono text-[11px] text-teal">{hover.issueKey}</span>
              <StatusPill status={hover.status} />
            </div>
            <div className="text-sm mt-1 font-medium leading-snug">{hover.title}</div>
            <div className="mono text-[10px] text-muted-foreground mt-2 truncate">
              {hover.repo} · {hover.branch}
            </div>
            <div className="mono text-[10px] text-muted-foreground mt-1 truncate">
              step · {hover.step}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Gate({ active }: { active: boolean }) {
  // A rail signal: two posts, a horizontal arm that lowers when active.
  return (
    <div className="relative h-5 w-5 flex items-center justify-center" aria-hidden>
      <div className={`absolute inset-0 rounded-full ${active ? "pulse-amber" : ""}`} />
      <svg width="22" height="22" viewBox="0 0 22 22" className="relative">
        <rect x="4" y="4" width="2" height="14" fill={active ? "#E8A33D" : "#2A2F3B"} />
        <rect x="16" y="4" width="2" height="14" fill={active ? "#E8A33D" : "#2A2F3B"} />
        <rect
          x="5"
          y={active ? 10 : 5}
          width="12"
          height="2"
          fill={active ? "#E8A33D" : "#3FB6C0"}
          style={{ transition: "y 600ms cubic-bezier(0.65,0,0.35,1)" }}
        />
        {active && <circle cx="11" cy="11" r="2.2" fill="#E8A33D" />}
      </svg>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: "teal" | "amber" | "moss" | "brick"; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full bg-${swatch}`} />
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: Job["status"] }) {
  const color = statusColor(status);
  const colorClass =
    color === "amber"
      ? "bg-amber/15 text-amber border-amber/30"
      : color === "moss"
        ? "bg-moss/15 text-moss border-moss/30"
        : color === "brick"
          ? "bg-brick/15 text-brick border-brick/30"
          : color === "muted"
            ? "bg-surface-2 text-muted-foreground border-hairline"
            : "bg-teal/15 text-teal border-teal/30";
  return (
    <span
      className={`mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${colorClass}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
