import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";
import {
  CalendarDays,
  FileDown,
  FileSpreadsheet,
  LayoutGrid,
  List,
  Plus,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSemester } from "@/contexts/SemesterContext";
import {
  COHORTS,
  courseColor,
  downloadCsv,
  sessionsToCsv,
  sortSessions,
  type SessionRow,
} from "@/lib/uov";
import { exportTimetablePdf } from "@/lib/pdf";
import {
  EmptyState,
  Field,
  Loading,
  PageHeader,
  Pill,
  SearchBox,
  Segmented,
  Table,
  td,
  th,
} from "@/components/app/common";
import WeeklyGrid from "@/components/app/WeeklyGrid";
import SessionDialog from "@/components/app/SessionDialog";
import SessionForm from "@/components/app/SessionForm";
import { cn } from "@/lib/utils";

type ViewBy = "mine" | "cohort" | "lecturer" | "room" | "all";

export default function TimetablePage() {
  const { user } = useAuth();
  const role = user?.role || "student";
  const params = new URLSearchParams(useSearch());
  const { semester, academicYear } = useSemester();
  const sessions = trpc.sessions.list.useQuery({ semester });
  const staff = trpc.staff.list.useQuery(undefined, {
    enabled: role !== "student",
  });
  const rooms = trpc.rooms.list.useQuery(undefined, {
    enabled: role !== "student",
  });
  const me = trpc.sessions.myStaffProfile.useQuery(undefined, {
    enabled: role === "lecturer",
  });
  const periods = trpc.settings.periods.useQuery();
  const [viewBy, setViewBy] = useState<ViewBy>(
    role === "student" ? "mine" : role === "lecturer" ? "mine" : "cohort"
  );
  const [cohort, setCohort] = useState(params.get("cohort") || "IT-L1");
  const [staffId, setStaffId] = useState<number | null>(
    params.get("staff") ? Number(params.get("staff")) : null
  );
  const [roomId, setRoomId] = useState<number | null>(
    params.get("room") ? Number(params.get("room")) : null
  );
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => {
    if (params.get("staff")) setViewBy("lecturer");
    else if (params.get("room")) setViewBy("room");
    else if (params.get("cohort")) setViewBy("cohort");
  }, []);
  useEffect(() => {
    if (!staffId && staff.data?.length) setStaffId(staff.data[0].id);
    if (!roomId && rooms.data?.length) setRoomId(rooms.data[0].id);
  }, [staff.data, rooms.data]);

  const filtered = useMemo(() => {
    let list = sessions.data || [];
    if (viewBy === "mine" && role === "lecturer")
      list = list.filter(s => me.data && s.staffIds.includes(me.data.id));
    if (viewBy === "cohort")
      list = list.filter(s => s.cohorts.includes(cohort));
    if (viewBy === "lecturer")
      list = list.filter(s => staffId && s.staffIds.includes(staffId));
    if (viewBy === "room") list = list.filter(s => s.roomId === roomId);
    if (type !== "all") list = list.filter(s => s.classType === type);
    if (!showCancelled) list = list.filter(s => s.status !== "cancelled");
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(s =>
        `${s.subjectCode} ${s.subjectName} ${s.room?.name || ""} ${s.room?.code || ""} ${s.staff.map(p => p.name).join(" ")} ${s.batch}`
          .toLowerCase()
          .includes(q)
      );
    return list;
  }, [
    sessions.data,
    viewBy,
    cohort,
    staffId,
    roomId,
    type,
    query,
    showCancelled,
    me.data,
    role,
  ]);

  const title = useMemo(() => {
    if (viewBy === "mine")
      return role === "student"
        ? `${user?.level ? `Level ${user.level} · ${user.program || "IT"}` : "My"} timetable`
        : "My teaching timetable";
    if (viewBy === "cohort")
      return `${COHORTS.find(c => c.key === cohort)?.label || cohort} timetable`;
    if (viewBy === "lecturer")
      return `${staff.data?.find(p => p.id === staffId)?.name || "Lecturer"} — teaching timetable`;
    if (viewBy === "room") {
      const room = rooms.data?.find(r => r.id === roomId);
      return `${room ? `${room.code} ${room.name}` : "Room"} — booking timetable`;
    }
    return "Faculty master timetable";
  }, [viewBy, cohort, staffId, roomId, staff.data, rooms.data, user, role]);

  const hours = filtered.reduce(
    (sum, s) =>
      sum +
      Math.max(1, Math.round((toMin(s.endTime) - toMin(s.startTime)) / 55)),
    0
  );
  const exportPdf = async () => {
    if (!filtered.length)
      return toast.info("There are no sessions in this view.");
    await exportTimetablePdf({
      title,
      subtitle: `University of Vavuniya · ${academicYear} · Semester ${semester}`,
      sessions: filtered,
      periods: periods.data?.periods,
      filename: `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-S${semester}.pdf`,
    });
  };

  return (
    <>
      <PageHeader
        eyebrow={`${academicYear} · Semester ${semester}`}
        title={title}
        description={`${filtered.length} weekly sessions · ${hours} teaching hours`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportPdf()}
            >
              <FileDown size={14} /> PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  `timetable-S${semester}.csv`,
                  sessionsToCsv(filtered)
                )
              }
              disabled={!filtered.length}
            >
              <FileSpreadsheet size={14} /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </Button>
            {role !== "student" && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus size={14} /> Add session
              </Button>
            )}
          </>
        }
      />

      <div className="no-print panel mb-4 flex flex-wrap items-end gap-3 p-4">
        {role !== "student" && (
          <Field label="View by">
            <Segmented<ViewBy>
              value={viewBy}
              onChange={setViewBy}
              options={[
                ...(role === "lecturer"
                  ? [{ value: "mine" as ViewBy, label: "Mine" }]
                  : []),
                { value: "cohort", label: "Cohort" },
                { value: "lecturer", label: "Lecturer" },
                { value: "room", label: "Hall" },
                { value: "all", label: "All" },
              ]}
            />
          </Field>
        )}
        {viewBy === "cohort" && (
          <Field label="Cohort" className="w-48">
            <select
              className="field"
              value={cohort}
              onChange={e => setCohort(e.target.value)}
            >
              {COHORTS.map(c => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {viewBy === "lecturer" && (
          <Field label="Lecturer" className="w-64">
            <select
              className="field"
              value={staffId ?? ""}
              onChange={e => setStaffId(Number(e.target.value))}
            >
              {(staff.data || []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {viewBy === "room" && (
          <Field label="Lecture hall / lab" className="w-64">
            <select
              className="field"
              value={roomId ?? ""}
              onChange={e => setRoomId(Number(e.target.value))}
            >
              {(rooms.data || []).map(r => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Type" className="w-36">
          <select
            className="field"
            value={type}
            onChange={e => setType(e.target.value)}
          >
            <option value="all">All types</option>
            <option>Theory</option>
            <option>Practical</option>
            <option>Tutorial</option>
          </select>
        </Field>
        <Field label="Search" className="min-w-[200px] flex-1">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Course, lecturer, hall…"
          />
        </Field>
        <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={e => setShowCancelled(e.target.checked)}
          />{" "}
          Show cancelled
        </label>
        <Segmented
          value={layout}
          onChange={setLayout}
          options={[
            { value: "grid", label: <LayoutGrid size={14} /> },
            { value: "list", label: <List size={14} /> },
          ]}
        />
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mb-3 text-sm">
          University of Vavuniya · {academicYear} · Semester {semester}
        </p>
      </div>

      {sessions.isLoading ? (
        <Loading />
      ) : !filtered.length ? (
        <EmptyState
          icon={CalendarDays}
          title="No sessions in this view"
          description={
            role === "admin"
              ? "Generate the semester timetable or adjust the filters."
              : "Nothing is scheduled here yet for this semester."
          }
        />
      ) : layout === "grid" ? (
        <WeeklyGrid
          sessions={filtered}
          periods={periods.data?.periods}
          onSelect={setSelected}
          showCohort={viewBy !== "cohort" && viewBy !== "mine"}
          compact={viewBy === "all"}
        />
      ) : (
        <div className="panel overflow-hidden">
          <Table>
            <thead>
              <tr>
                {[
                  "Day",
                  "Time",
                  "Course",
                  "Type",
                  "Cohort",
                  "Lecturer",
                  "Hall",
                  "Status",
                ].map(h => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortSessions(filtered).map(s => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className="cursor-pointer hover:bg-muted/40"
                >
                  <td className={cn(td, "font-medium")}>{s.day}</td>
                  <td className={cn(td, "tabular whitespace-nowrap")}>
                    {s.startTime}–{s.endTime}
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
                  <td className={cn(td, "whitespace-nowrap")}>{s.batch}</td>
                  <td className={td}>
                    {s.staff.map(p => p.name).join(", ") || "TBA"}
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    {s.room ? `${s.room.code}` : "TBA"}
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

const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
