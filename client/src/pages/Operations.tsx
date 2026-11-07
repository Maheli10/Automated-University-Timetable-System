import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, GitPullRequestArrow, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSemester } from "@/contexts/SemesterContext";
import {
  COHORTS,
  courseColor,
  friendlyError,
  sortSessions,
  type SessionRow,
} from "@/lib/uov";
import {
  ConfirmButton,
  EmptyState,
  Loading,
  PageHeader,
  Pill,
  SearchBox,
  Segmented,
  Table,
  td,
  th,
} from "@/components/app/common";
import SessionDialog from "@/components/app/SessionDialog";
import SessionForm from "@/components/app/SessionForm";
import { cn } from "@/lib/utils";

export function SessionsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { semester } = useSemester();
  const utils = trpc.useUtils();
  const allQuery = trpc.sessions.list.useQuery(
    { semester },
    { enabled: isAdmin }
  );
  const mineQuery = trpc.sessions.mine.useQuery(
    { semester },
    { enabled: !isAdmin }
  );
  const query = isAdmin ? allQuery : mineQuery;
  const [cohort, setCohort] = useState("all");
  const [status, setStatus] = useState<
    "all" | "attention" | "cancelled" | "manual"
  >("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const clear = trpc.sessions.clearSemester.useMutation({
    onSuccess: r => {
      toast.success(`${r.removed} sessions removed`);
      utils.sessions.list.invalidate();
      utils.analytics.overview.invalidate();
    },
    onError: e => toast.error(friendlyError(e)),
  });
  const list = useMemo(() => {
    let rows = query.data || [];
    if (cohort !== "all") rows = rows.filter(s => s.cohorts.includes(cohort));
    if (status === "attention")
      rows = rows.filter(
        s => !s.roomId || !s.staffIds.length || s.status === "rescheduled"
      );
    if (status === "cancelled")
      rows = rows.filter(s => s.status === "cancelled");
    if (status === "manual") rows = rows.filter(s => !s.generationRunId);
    const t = q.toLowerCase();
    if (t)
      rows = rows.filter(s =>
        `${s.subjectCode} ${s.subjectName} ${s.staff.map(p => p.name).join(" ")} ${s.room?.code || ""}`
          .toLowerCase()
          .includes(t)
      );
    return sortSessions(rows);
  }, [query.data, cohort, status, q]);
  return (
    <>
      <PageHeader
        eyebrow={`Semester ${semester}`}
        title={isAdmin ? "Sessions & changes" : "My sessions"}
        description={
          isAdmin
            ? "Every weekly session in one list. Open a session to reschedule it, change its lecture hall or lecturer, cancel a single date or the whole session."
            : "Sessions you teach. You can reschedule or cancel them directly — the system checks for clashes — or send a change request to the administrator."
        }
        actions={
          <>
            {isAdmin && (
              <ConfirmButton
                title={`Remove every Semester ${semester} session?`}
                description="The whole semester timetable is cleared. You can generate it again at any time."
                confirmLabel="Clear semester"
                onConfirm={() => clear.mutate({ semester })}
                className="text-destructive"
              >
                Clear semester
              </ConfirmButton>
            )}
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> Add session
            </Button>
          </>
        }
      />
      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-4">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "attention", label: "Needs attention" },
            { value: "manual", label: "Manual" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        {isAdmin && (
          <select
            className="field w-48"
            value={cohort}
            onChange={e => setCohort(e.target.value)}
          >
            <option value="all">All cohorts</option>
            {COHORTS.map(c => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <SearchBox
          value={q}
          onChange={setQ}
          className="min-w-[220px] flex-1"
          placeholder="Course, lecturer, hall"
        />
      </div>
      {query.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState
          title="No sessions"
          description="Nothing matches these filters for this semester."
        />
      ) : (
        <div className="panel overflow-hidden">
          <Table>
            <thead>
              <tr>
                {[
                  "When",
                  "Course",
                  "Type",
                  "Cohort",
                  "Lecturer",
                  "Hall",
                  "Source",
                  "Status",
                ].map(h => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className="cursor-pointer hover:bg-muted/40"
                >
                  <td className={cn(td, "whitespace-nowrap")}>
                    <b>{s.day.slice(0, 3)}</b>{" "}
                    <span className="tabular">
                      {s.startTime}–{s.endTime}
                    </span>
                  </td>
                  <td className={td}>
                    <span
                      className="mr-2 inline-block size-2 rounded-full"
                      style={{
                        backgroundColor: courseColor(s.subjectCode).border,
                      }}
                    />
                    <b>{s.subjectCode}</b>{" "}
                    <span className="text-muted-foreground">
                      {s.subjectName}
                    </span>
                  </td>
                  <td className={td}>
                    <Pill tone={s.classType === "Practical" ? "gold" : "blue"}>
                      {s.classType}
                    </Pill>
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-xs")}>
                    {s.batch}
                  </td>
                  <td className={cn(td, "text-xs")}>
                    {s.staff.map(p => p.name).join(", ") || (
                      <Pill tone="gold">TBA</Pill>
                    )}
                  </td>
                  <td className={cn(td, "text-xs whitespace-nowrap")}>
                    {s.room ? s.room.code : <Pill tone="gold">TBA</Pill>}
                  </td>
                  <td className={cn(td, "text-xs text-muted-foreground")}>
                    {s.generationRunId
                      ? `Generated #${s.generationRunId}`
                      : "Manual"}
                  </td>
                  <td className={td}>
                    <Pill
                      tone={
                        s.status === "cancelled"
                          ? "red"
                          : s.status === "rescheduled"
                            ? "gold"
                            : "green"
                      }
                    >
                      {s.status}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="px-4 py-2 text-xs text-muted-foreground">
            {list.length} sessions
          </p>
        </div>
      )}
      <SessionDialog
        session={selected}
        onClose={() => setSelected(null)}
        onEdit={s => {
          setSelected(null);
          setEditing(s);
        }}
      />
      <SessionForm
        open={creating || Boolean(editing)}
        session={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

export function RequestsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const swaps = trpc.swaps.list.useQuery();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const review = trpc.swaps.review.useMutation({
    onSuccess: (_, v) => {
      toast.success(
        v.status === "approved"
          ? "Approved and applied to the timetable"
          : "Request rejected"
      );
      utils.swaps.list.invalidate();
      utils.sessions.list.invalidate();
    },
    onError: e => toast.error(friendlyError(e), { duration: 9000 }),
  });
  const list = (swaps.data || []).filter(
    s => filter === "all" || s.status === "pending"
  );
  return (
    <>
      <PageHeader
        eyebrow="Approval flow"
        title="Timetable change requests"
        description={
          isAdmin
            ? "Lecturers ask to move sessions. Approving checks every constraint and moves the session automatically; the lecturer and students are notified."
            : "Requests you sent to the administrator. Open a session in the timetable and choose “Request change” to create one."
        }
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending", label: "Pending" },
              { value: "all", label: "All" },
            ]}
          />
        }
      />
      {swaps.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState
          icon={GitPullRequestArrow}
          title={filter === "pending" ? "Nothing waiting" : "No requests yet"}
        />
      ) : (
        <div className="grid gap-3">
          {list.map(r => (
            <div
              key={r.id}
              className="panel flex flex-wrap items-start gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{r.session?.subjectCode || `Session #${r.sessionId}`}</b>
                  <span className="text-sm text-muted-foreground">
                    {r.session?.subjectName}
                  </span>
                  <Pill
                    tone={
                      r.status === "pending"
                        ? "gold"
                        : r.status === "approved"
                          ? "green"
                          : "red"
                    }
                  >
                    {r.status}
                  </Pill>
                </div>
                <p className="mt-1.5 text-sm">
                  {r.session ? (
                    <span className="text-muted-foreground line-through">
                      {r.session.day} {r.session.startTime}–{r.session.endTime}
                    </span>
                  ) : null}{" "}
                  →{" "}
                  <b>
                    {r.requestedDay} {r.requestedStartTime}–{r.requestedEndTime}
                  </b>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  “{r.reason}” — {r.requesterName},{" "}
                  {new Date(r.createdAt as any).toLocaleDateString()}
                </p>
                {r.reviewerNote && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Admin note: {r.reviewerNote}
                  </p>
                )}
              </div>
              {isAdmin && r.status === "pending" && (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <input
                    className="field h-9 w-56"
                    placeholder="Note (optional)"
                    value={notes[r.id] || ""}
                    onChange={e =>
                      setNotes(n => ({ ...n, [r.id]: e.target.value }))
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      review.mutate({
                        id: r.id,
                        status: "rejected",
                        reviewerNote: notes[r.id],
                      })
                    }
                  >
                    <X size={14} /> Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      review.mutate({
                        id: r.id,
                        status: "approved",
                        reviewerNote: notes[r.id],
                        apply: true,
                      })
                    }
                  >
                    <Check size={14} /> Approve & apply
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
