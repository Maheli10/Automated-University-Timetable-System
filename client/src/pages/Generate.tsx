import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cpu,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useSemester } from "@/contexts/SemesterContext";
import { friendlyError, type RouterOutputs } from "@/lib/uov";
import {
  Field,
  Notice,
  PageHeader,
  Panel,
  Pill,
  ProgressBar,
  StatCard,
  Table,
  td,
  th,
} from "@/components/app/common";
import { cn } from "@/lib/utils";

type Result = RouterOutputs["timetable"]["generate"];

export default function GeneratePage() {
  const { semester, setSemester, academicYear } = useSemester();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const readiness = trpc.timetable.readiness.useQuery({ semester });
  const runs = trpc.timetable.runs.useQuery();
  const academic = trpc.settings.academic.useQuery();
  const [levels, setLevels] = useState([1, 2, 3, 4]);
  const [programs, setPrograms] = useState<("IT" | "AMC")[]>(["IT", "AMC"]);
  const [replace, setReplace] = useState<
    "all-routine" | "generated-only" | "none"
  >("all-routine");
  const [cohortSize, setCohortSize] = useState<number | "">("");
  const [notify, setNotify] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const generate = trpc.timetable.generate.useMutation({
    onSuccess: async data => {
      setResult(data);
      if (data.unscheduled.length)
        toast.warning(
          `${data.placements.length} sessions placed · ${data.unscheduled.length} could not be placed`
        );
      else
        toast.success(
          `Timetable generated — all ${data.placements.length} sessions placed without clashes`
        );
      await Promise.all([
        utils.sessions.list.invalidate(),
        utils.analytics.overview.invalidate(),
        utils.timetable.runs.invalidate(),
        utils.timetable.readiness.invalidate(),
      ]);
    },
    onError: e => toast.error(friendlyError(e), { duration: 9000 }),
  });
  const r = readiness.data;
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value];

  return (
    <>
      <PageHeader
        eyebrow="Scheduling"
        title="Generate semester timetable"
        description="Builds the weekly timetable for every level of the IT and AMC programmes at once. Theory hours become one-hour lectures on different days, practical hours become two-hour lab blocks in the official practical slots, and each session gets a free lecturer and a suitable hall."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel
            title="1 · Scope"
            description={`Academic year ${academicYear}`}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Semester">
                <div className="flex gap-2">
                  {[1, 2].map(s => (
                    <button
                      key={s}
                      onClick={() => setSemester(s as 1 | 2)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold",
                        semester === s
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-white"
                      )}
                    >
                      Semester {s}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Levels">
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(l => (
                    <button
                      key={l}
                      onClick={() =>
                        setLevels(v =>
                          v.includes(l) && v.length === 1
                            ? v
                            : toggle(v, l).sort()
                        )
                      }
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold",
                        levels.includes(l)
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-white text-muted-foreground"
                      )}
                    >
                      L{l}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Programmes">
                <div className="flex gap-2">
                  {(["IT", "AMC"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() =>
                        setPrograms(v =>
                          v.includes(p) && v.length === 1 ? v : toggle(v, p)
                        )
                      }
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold",
                        programs.includes(p)
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-white text-muted-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                label="Default cohort size"
                hint="Used when a cohort has no student accounts yet."
              >
                <input
                  className="field"
                  type="number"
                  min={1}
                  placeholder={String(academic.data?.defaultCohortSize ?? 50)}
                  value={cohortSize}
                  onChange={e =>
                    setCohortSize(e.target.value ? Number(e.target.value) : "")
                  }
                />
              </Field>
            </div>
          </Panel>

          <Panel title="2 · Existing sessions">
            <div className="grid gap-2 md:grid-cols-3">
              {[
                {
                  value: "all-routine",
                  title: "Replace all weekly sessions",
                  text: "Clean rebuild of the selected levels. One-off sessions are kept.",
                },
                {
                  value: "generated-only",
                  title: "Keep manual sessions",
                  text: "Only previously generated sessions are replaced; manual ones stay fixed.",
                },
                {
                  value: "none",
                  title: "Add to current timetable",
                  text: "Nothing is removed; new sessions fill the remaining free slots.",
                },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setReplace(option.value as any)}
                  className={cn(
                    "rounded-xl border p-3 text-left",
                    replace === option.value
                      ? "border-primary bg-primary/5 ring-2 ring-primary/10"
                      : "border-border bg-white"
                  )}
                >
                  <p className="text-sm font-semibold">{option.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {option.text}
                  </p>
                </button>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notify}
                onChange={e => setNotify(e.target.checked)}
              />{" "}
              Publish a notice to students and lecturers when done
            </label>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                disabled={generate.isPending || !r?.teachable}
                onClick={() =>
                  generate.mutate({
                    semester,
                    levels,
                    programs,
                    replace,
                    notify,
                    defaultCohortSize: cohortSize || undefined,
                  })
                }
              >
                {generate.isPending ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {generate.isPending
                  ? "Scheduling every level…"
                  : `Generate Semester ${semester} timetable`}
              </Button>
              {!r?.teachable && (
                <span className="text-sm text-muted-foreground">
                  Declare courses for this semester first.
                </span>
              )}
            </div>
          </Panel>

          {result && (
            <Panel
              title="Generation result"
              description={`Run #${result.runId} · ${result.stats.runtimeMs} ms · ${result.removed} previous sessions replaced`}
              actions={
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation("/analytics")}
                  >
                    Analytics
                  </Button>
                  <Button size="sm" onClick={() => setLocation("/timetable")}>
                    View timetable
                  </Button>
                </>
              }
            >
              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard
                  label="Sessions placed"
                  value={result.stats.placed}
                  icon={CheckCircle2}
                  tone="green"
                />
                <StatCard
                  label="Not placed"
                  value={result.stats.unplaced}
                  icon={XCircle}
                  tone={result.stats.unplaced ? "red" : "slate"}
                />
                <StatCard
                  label="Teaching hours"
                  value={`${result.stats.scheduledHours}/${result.stats.requiredHours}`}
                  icon={Clock3}
                  tone="blue"
                />
                <StatCard
                  label="Courses"
                  value={result.stats.courses}
                  icon={Cpu}
                  tone="gold"
                />
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(result.stats.cohorts)
                  .filter(([, v]) => v.required)
                  .map(([key, v]) => (
                    <div
                      key={key}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="flex justify-between text-sm">
                        <b>{key.replace("-L", " · Level ")}</b>
                        <span
                          className={
                            v.placed === v.required
                              ? "text-emerald-700"
                              : "text-red-700"
                          }
                        >
                          {v.placed}/{v.required}
                        </span>
                      </div>
                      <ProgressBar
                        value={(v.placed / v.required) * 100}
                        tone={v.placed === v.required ? "green" : "red"}
                        className="mt-2"
                      />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {v.hours} h per week
                      </p>
                    </div>
                  ))}
              </div>
              {result.stats.placedByPass &&
                Object.keys(result.stats.placedByPass).length > 1 && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Some sessions needed relaxed preferences:{" "}
                    {Object.entries(result.stats.placedByPass)
                      .map(([k, v]) => `${k.replace("pass", "pass ")}: ${v}`)
                      .join(" · ")}
                    . Pass 1 respects every preference.
                  </p>
                )}
              {!!result.unscheduled.length && (
                <div className="mt-5">
                  <p className="mb-2 text-sm font-semibold text-red-800">
                    Could not be placed
                  </p>
                  <Table>
                    <thead>
                      <tr>
                        {["Course", "Cohort", "Type", "Reason"].map(h => (
                          <th key={h} className={th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.unscheduled.map((u, i) => (
                        <tr key={i}>
                          <td className={td}>
                            <b>{u.code}</b> {u.name}
                          </td>
                          <td className={td}>{u.cohort}</td>
                          <td className={td}>{u.classType}</td>
                          <td className={cn(td, "text-red-800")}>{u.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
              {!!result.warnings.length && (
                <div className="mt-5 space-y-2">
                  {result.warnings.map(w => (
                    <Notice key={w} tone="gold">
                      {w}
                    </Notice>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Readiness check" description={`Semester ${semester}`}>
            {!r ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-3 text-sm">
                <Row
                  ok={r.teachable > 0}
                  label="Courses with teaching hours"
                  value={`${r.teachable} of ${r.courses}`}
                />
                <Row
                  ok={r.lecturers > 0}
                  label="Active lecturers"
                  value={r.lecturers}
                />
                <Row ok={r.halls > 0} label="Lecture halls" value={r.halls} />
                <Row ok={r.labs > 0} label="Laboratories" value={r.labs} />
                <Row
                  ok={!r.noLecturer.length}
                  warn
                  label="Courses without lecturer"
                  value={r.noLecturer.length}
                />
                {!!r.noLecturer.length && (
                  <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    {r.noLecturer.slice(0, 6).map(c => (
                      <p key={c.id}>
                        <b>{c.code}</b> {c.name}
                      </p>
                    ))}
                    <button
                      className="mt-1 font-semibold underline"
                      onClick={() => setLocation("/assignments")}
                    >
                      Assign lecturers →
                    </button>
                    <p className="mt-1 opacity-80">
                      These are still scheduled, shown as “Lecturer TBA”.
                    </p>
                  </div>
                )}
                {!!r.zeroHour.length && (
                  <p className="text-xs text-muted-foreground">
                    Skipped (no weekly hours):{" "}
                    {r.zeroHour.map(z => z.code).join(", ")}
                  </p>
                )}
              </div>
            )}
          </Panel>
          {r && (
            <Panel
              title="Weekly load per cohort"
              description={`${r.periodsPerWeek} teaching periods available per week`}
            >
              <div className="space-y-3">
                {r.cohorts
                  .filter(c => c.courses)
                  .map(c => {
                    const over = c.coreHours > r.periodsPerWeek;
                    return (
                      <div key={c.cohort}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{c.label}</span>
                          <span className="tabular text-muted-foreground">
                            {c.hours} h
                            {c.electiveHours
                              ? ` (${c.electiveHours} elective)`
                              : ""}
                          </span>
                        </div>
                        <ProgressBar
                          value={(c.coreHours / r.periodsPerWeek) * 100}
                          tone={
                            over
                              ? "red"
                              : c.coreHours > r.periodsPerWeek * 0.8
                                ? "gold"
                                : "plum"
                          }
                          className="mt-1"
                        />
                        {over && (
                          <p className="mt-1 text-xs text-red-700">
                            Core hours exceed the week — some sessions cannot
                            fit.
                          </p>
                        )}
                      </div>
                    );
                  })}
                <p className="text-xs leading-5 text-muted-foreground">
                  Electives of the same level may run in parallel, so they need
                  fewer periods than their total hours.
                </p>
              </div>
            </Panel>
          )}
          <Panel title="Previous runs">
            {!runs.data?.length ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="space-y-2">
                {runs.data.slice(0, 6).map(run => (
                  <li
                    key={run.id}
                    className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                  >
                    <span>
                      <b>#{run.id}</b> · Sem {run.semester}
                      <span className="block text-xs text-muted-foreground">
                        {new Date(run.createdAt as any).toLocaleString()}
                      </span>
                    </span>
                    {run.unscheduled ? (
                      <Pill tone="red">{run.unscheduled} unplaced</Pill>
                    ) : (
                      <Pill tone="green">{run.scheduled} placed</Pill>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Row({
  ok,
  label,
  value,
  warn,
}: {
  ok: boolean;
  label: string;
  value: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 size={16} className="text-emerald-600" />
      ) : warn ? (
        <AlertTriangle size={16} className="text-amber-600" />
      ) : (
        <XCircle size={16} className="text-red-600" />
      )}
      <span className="flex-1">{label}</span>
      <b className="tabular">{value}</b>
    </div>
  );
}
