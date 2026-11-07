import { Fragment, useMemo } from "react";
import { FlaskConical, MapPin, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  courseColor,
  DAYS,
  DEFAULT_PERIODS,
  overlaps,
  SHORT_DAY,
  todayName,
  toMinutes,
  type SessionRow,
} from "@/lib/uov";

type Period = { start: string; end: string };

export default function WeeklyGrid({
  sessions,
  periods = DEFAULT_PERIODS,
  onSelect,
  showCohort = true,
  showLecturer = true,
  compact,
  highlightFree,
}: {
  sessions: SessionRow[];
  periods?: Period[];
  onSelect?: (session: SessionRow) => void;
  showCohort?: boolean;
  showLecturer?: boolean;
  compact?: boolean;
  highlightFree?: boolean;
}) {
  const today = todayName();
  const layout = useMemo(() => {
    // grid rows: periods interleaved with break rows
    const rows: Array<
      | { kind: "period"; index: number; period: Period }
      | { kind: "break"; label: string; start: string; end: string }
    > = [];
    periods.forEach((period, index) => {
      const prev = periods[index - 1];
      if (prev && toMinutes(period.start) > toMinutes(prev.end)) {
        const lunch =
          toMinutes(prev.end) >= toMinutes("12:00") &&
          toMinutes(period.start) <= toMinutes("14:00");
        rows.push({
          kind: "break",
          label: lunch ? "Lunch break" : "Tea break",
          start: prev.end,
          end: period.start,
        });
      }
      rows.push({ kind: "period", index, period });
    });
    const rowOf = new Map<number, number>();
    rows.forEach(
      (row, i) => row.kind === "period" && rowOf.set(row.index, i + 2)
    );
    // Cluster overlapping sessions per day. Each item retains its own period
    // span; this is important in the master view where many cohorts share a
    // start time.
    type ClusterItem = {
      session: SessionRow;
      first: number;
      last: number;
      lane: number;
      rowStart: number;
      rowEnd: number;
    };
    const toClusterItems = (items: SessionRow[]): ClusterItem[] =>
      items.map(session => {
        const indexes = periods
          .map((period, index) =>
            overlaps(
              session.startTime,
              session.endTime,
              period.start,
              period.end
            )
              ? index
              : -1
          )
          .filter(index => index >= 0);
        return {
          session,
          first: indexes[0],
          last: indexes[indexes.length - 1],
          lane: 0,
          rowStart: rowOf.get(indexes[0])!,
          rowEnd: rowOf.get(indexes[indexes.length - 1])! + 1,
        };
      });
    const clusters: Array<{
      day: string;
      rowStart: number;
      rowEnd: number;
      items: ClusterItem[];
    }> = [];
    for (const day of DAYS) {
      const list = sessions
        .filter(s => s.day === day)
        .map(s => {
          const idx = periods
            .map((p, i) =>
              overlaps(s.startTime, s.endTime, p.start, p.end) ? i : -1
            )
            .filter(i => i >= 0);
          return {
            s,
            first: idx.length ? idx[0] : -1,
            last: idx.length ? idx[idx.length - 1] : -1,
          };
        })
        .filter(x => x.first >= 0)
        .sort((a, b) => a.first - b.first || a.last - b.last);
      let current: { first: number; last: number; items: SessionRow[] } | null =
        null;
      for (const entry of list) {
        if (current && entry.first <= current.last) {
          current.items.push(entry.s);
          current.last = Math.max(current.last, entry.last);
        } else {
          if (current)
            clusters.push({
              day,
              rowStart: rowOf.get(current.first)!,
              rowEnd: rowOf.get(current.last)! + 1,
              items: toClusterItems(current.items),
            });
          current = { first: entry.first, last: entry.last, items: [entry.s] };
        }
      }
      if (current)
        clusters.push({
          day,
          rowStart: rowOf.get(current.first)!,
          rowEnd: rowOf.get(current.last)! + 1,
          items: toClusterItems(current.items),
        });
    }
    // Assign non-overlapping horizontal lanes inside each cluster. The
    // nested grid then allows a practical to span two rows even when other
    // sessions start at the same time.
    for (const cluster of clusters) {
      const laneEnds: number[] = [];
      for (const item of cluster.items.sort(
        (a, b) => a.first - b.first || a.last - b.last
      )) {
        let lane = laneEnds.findIndex(end => end < item.first);
        if (lane < 0) {
          lane = laneEnds.length;
          laneEnds.push(-1);
        }
        item.lane = lane;
        laneEnds[lane] = item.last;
      }
    }
    return { rows, clusters };
  }, [sessions, periods]);

  const template = layout.rows
    .map(row =>
      row.kind === "break"
        ? "26px"
        : compact
          ? "minmax(64px,auto)"
          : "minmax(84px,auto)"
    )
    .join(" ");

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-border bg-white">
      <div
        className="grid min-w-[980px]"
        style={{
          gridTemplateColumns: "84px repeat(5, minmax(170px, 1fr))",
          gridTemplateRows: `44px ${template}`,
        }}
      >
        {/* header */}
        <div
          className="sticky left-0 z-10 border-b border-border bg-muted/60"
          style={{ gridRow: 1, gridColumn: 1 }}
        />
        {DAYS.map((day, i) => (
          <div
            key={day}
            className={cn(
              "flex items-center justify-center gap-1.5 border-b border-l border-border text-xs font-bold tracking-wide uppercase",
              day === today
                ? "bg-primary text-white"
                : "bg-muted/60 text-foreground"
            )}
            style={{ gridRow: 1, gridColumn: i + 2 }}
          >
            <span className="md:hidden">{SHORT_DAY[day]}</span>
            <span className="hidden md:inline">{day}</span>
            {day === today && (
              <span className="rounded-full bg-white/20 px-1.5 py-px text-[9px]">
                Today
              </span>
            )}
          </div>
        ))}
        {/* rows */}
        {layout.rows.map((row, i) =>
          row.kind === "break" ? (
            <div
              key={`b-${i}`}
              className="flex items-center justify-center border-b border-border bg-[repeating-linear-gradient(135deg,#f7f9fd,#f7f9fd_6px,#edf2fa_6px,#edf2fa_12px)] text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
              style={{ gridRow: i + 2, gridColumn: "1 / span 6" }}
            >
              {row.label} · {row.start}–{row.end}
            </div>
          ) : (
            <Fragment key={`p-${i}`}>
              <div
                className="sticky left-0 z-10 flex flex-col items-center justify-center border-b border-border bg-white text-[11px] font-semibold text-foreground tabular"
                style={{ gridRow: i + 2, gridColumn: 1 }}
              >
                <span>{row.period.start}</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {row.period.end}
                </span>
              </div>
              {DAYS.map((day, d) => (
                <div
                  key={`${day}-${i}`}
                  className={cn(
                    "border-b border-l border-border/70",
                    day === today && "bg-primary/[0.025]",
                    highlightFree && "bg-emerald-50/40"
                  )}
                  style={{ gridRow: i + 2, gridColumn: d + 2 }}
                />
              ))}
            </Fragment>
          )
        )}
        {/* sessions */}
        {layout.clusters.map(cluster => (
          <div
            key={`${cluster.day}-${cluster.rowStart}`}
            className={cn(
              "z-[1] gap-1 p-1",
              compact ? "grid h-full" : "flex",
              !compact && (cluster.items.length > 2 ? "flex-col" : "flex-row")
            )}
            style={{
              gridRow: `${cluster.rowStart} / ${cluster.rowEnd}`,
              gridColumn: DAYS.indexOf(cluster.day as any) + 2,
              ...(compact
                ? {
                    gridTemplateRows: `repeat(${cluster.rowEnd - cluster.rowStart}, minmax(64px, 1fr))`,
                    gridTemplateColumns: `repeat(${Math.max(...cluster.items.map(item => item.lane), 0) + 1}, minmax(0, 1fr))`,
                  }
                : {}),
            }}
          >
            {cluster.items.map(item => {
              const session = item.session;
              const color = courseColor(session.subjectCode);
              const cancelled = session.status === "cancelled";
              const dense = cluster.items.length > 2 || compact;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelect?.(session)}
                  title={`${session.subjectCode} ${session.subjectName}\n${session.startTime}–${session.endTime} · ${session.room?.name || "Room TBA"}\n${session.staff.map(p => p.name).join(", ") || "Lecturer TBA"}\n${session.batch}`}
                  className={cn(
                    "group min-w-0 flex-1 rounded-xl border px-2.5 text-left transition hover:-translate-y-px hover:shadow-md",
                    compact && "h-full min-h-0",
                    dense ? "py-1" : "py-1.5",
                    cancelled && "opacity-45 line-through"
                  )}
                  style={{
                    backgroundColor: color.bg,
                    borderColor: `${color.border}33`,
                    boxShadow: `inset 0 3px 0 ${color.border}`,
                    color: color.text,
                    ...(compact
                      ? {
                          gridRow: `${item.rowStart - cluster.rowStart + 1} / ${item.rowEnd - cluster.rowStart + 1}`,
                          gridColumn: item.lane + 1,
                        }
                      : {}),
                  }}
                >
                  <div className="min-w-0">
                    <span
                      className={cn(
                        "block min-w-0 text-[11.5px] font-bold",
                        session.classType === "Practical"
                          ? "shrink-0 whitespace-nowrap"
                          : "truncate"
                      )}
                    >
                      {session.subjectCode}
                    </span>
                    {session.classType === "Practical" && (
                      <span className="mt-0.5 inline-flex max-w-full items-center gap-0.5 overflow-hidden rounded bg-white/70 px-1 text-[9px] font-bold uppercase whitespace-nowrap">
                        <FlaskConical size={9} className="shrink-0" />
                        <span className="truncate">Lab</span>
                      </span>
                    )}
                    {session.status === "rescheduled" && (
                      <span className="mt-0.5 inline-flex max-w-full items-center overflow-hidden rounded bg-white/70 px-1 text-[9px] font-bold uppercase whitespace-nowrap">
                        <span className="truncate">Moved</span>
                      </span>
                    )}
                  </div>
                  {!dense && (
                    <p className="truncate text-[11px] leading-4 font-medium opacity-90">
                      {session.subjectName}
                    </p>
                  )}
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] opacity-80">
                    <MapPin size={10} className="shrink-0" />{" "}
                    {session.room?.code || "TBA"}
                    {dense && showLecturer && session.staff[0] && (
                      <span className="truncate">
                        ·{" "}
                        {session.staff[0].name.replace(
                          /^(Mr|Ms|Mrs|Dr|Prof)\.?\s*/i,
                          ""
                        )}
                      </span>
                    )}
                  </p>
                  {!dense && showLecturer && (
                    <p className="flex items-center gap-1 truncate text-[10.5px] opacity-80">
                      <UserRound size={10} className="shrink-0" />{" "}
                      {session.staff.map(p => p.name).join(", ") ||
                        "Lecturer TBA"}
                    </p>
                  )}
                  {!dense && showCohort && (
                    <p className="truncate text-[10px] font-semibold opacity-70">
                      {session.batch}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
