import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Plus,
  Save,
  Sparkles,
  UserRoundCog,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useSemester } from "@/contexts/SemesterContext";
import { courseColor, friendlyError, type CourseRow } from "@/lib/uov";
import {
  EmptyState,
  Field,
  Loading,
  PageHeader,
  Panel,
  Pill,
  ProgressBar,
  SearchBox,
  Segmented,
  Table,
  td,
  th,
} from "@/components/app/common";
import { cn } from "@/lib/utils";

type Link = {
  staffId: number;
  role: "coordinator" | "lecturer" | "instructor";
  component: "both" | "theory" | "practical";
};

function AssignDialog({
  course,
  onClose,
}: {
  course: CourseRow | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const staff = trpc.staff.list.useQuery();
  const rooms = trpc.rooms.list.useQuery();
  const [links, setLinks] = useState<Link[]>([]);
  const [preferredRoomId, setPreferred] = useState<number | null>(null);
  const [practicalRoomId, setPractical] = useState<number | null>(null);
  const [expected, setExpected] = useState<number | "">("");
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!course) return;
    setLinks(
      course.lecturers.map(l => ({
        staffId: l.staffId,
        role: l.role as any,
        component: l.component as any,
      }))
    );
    setPreferred(course.preferredRoomId ?? null);
    setPractical(course.practicalRoomId ?? null);
    setExpected(course.expectedStudents ?? "");
    setQ("");
  }, [course?.id]);
  const setLecturers = trpc.courses.setLecturers.useMutation();
  const setRooms = trpc.courses.setRooms.useMutation();
  const save = async () => {
    if (!course) return;
    try {
      await setLecturers.mutateAsync({ courseId: course.id, lecturers: links });
      await setRooms.mutateAsync({
        courseId: course.id,
        preferredRoomId,
        practicalRoomId,
        expectedStudents: expected === "" ? null : expected,
      });
      toast.success(`${course.code} assignment saved`);
      await utils.courses.list.invalidate();
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  const isLab = (t: string) => /lab|computer/i.test(t);
  if (!course) return null;
  const available = (staff.data || []).filter(
    p =>
      !links.some(l => l.staffId === p.id) &&
      `${p.name} ${p.staffCode}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {course.code} · {course.name}
          </DialogTitle>
          <DialogDescription>
            {course.cohort} · Semester {course.semester} · {course.theoryHours}h
            theory
            {course.practicalHours
              ? ` + ${course.practicalHours}h practical`
              : ""}{" "}
            per week
          </DialogDescription>
        </DialogHeader>
        <div>
          <p className="label">Assigned lecturers</p>
          {!links.length && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No lecturer yet — sessions will show “Lecturer TBA”.
            </p>
          )}
          <ul className="space-y-2">
            {links.map(link => {
              const person = staff.data?.find(p => p.id === link.staffId);
              return (
                <li
                  key={link.staffId}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {person?.name || "Unknown"}{" "}
                    {person?.status === "on-leave" && (
                      <Pill tone="red">on leave</Pill>
                    )}
                  </span>
                  <select
                    className="field h-8 w-36 text-xs"
                    value={link.role}
                    onChange={e =>
                      setLinks(ls =>
                        ls.map(l =>
                          l.staffId === link.staffId
                            ? { ...l, role: e.target.value as any }
                            : l
                        )
                      )
                    }
                  >
                    <option value="coordinator">Coordinator</option>
                    <option value="lecturer">Lecturer</option>
                    <option value="instructor">Instructor</option>
                  </select>
                  <select
                    className="field h-8 w-32 text-xs"
                    value={link.component}
                    onChange={e =>
                      setLinks(ls =>
                        ls.map(l =>
                          l.staffId === link.staffId
                            ? { ...l, component: e.target.value as any }
                            : l
                        )
                      )
                    }
                  >
                    <option value="both">Theory + lab</option>
                    <option value="theory">Theory only</option>
                    <option value="practical">Practical only</option>
                  </select>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      setLinks(ls => ls.filter(l => l.staffId !== link.staffId))
                    }
                    aria-label="Remove"
                  >
                    <X size={14} />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 rounded-lg border border-dashed border-border p-2">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Add a lecturer…"
            />
            <div className="scrollbar-thin mt-2 max-h-40 overflow-y-auto">
              {available.slice(0, 30).map(p => (
                <button
                  key={p.id}
                  onClick={() =>
                    setLinks(ls => [
                      ...ls,
                      {
                        staffId: p.id,
                        role: ls.length ? "lecturer" : "coordinator",
                        component: "both",
                      },
                    ])
                  }
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span>
                    {p.name}{" "}
                    <span className="text-xs text-muted-foreground">
                      {p.staffCode}
                    </span>
                  </span>
                  <Plus size={14} className="text-primary" />
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            With several lecturers, the generator gives each weekly session to
            the least-loaded free lecturer — sharing the teaching and balancing
            workloads.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Preferred lecture hall">
            <select
              className="field"
              value={preferredRoomId ?? ""}
              onChange={e =>
                setPreferred(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Any suitable hall</option>
              {(rooms.data || [])
                .filter(r => !isLab(r.type))
                .map(r => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.name} ({r.capacity})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Preferred laboratory">
            <select
              className="field"
              value={practicalRoomId ?? ""}
              onChange={e =>
                setPractical(e.target.value ? Number(e.target.value) : null)
              }
              disabled={!course.practicalHours}
            >
              <option value="">Any suitable lab</option>
              {(rooms.data || [])
                .filter(r => isLab(r.type))
                .map(r => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.name} ({r.capacity})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Expected students">
            <input
              className="field"
              type="number"
              min={0}
              placeholder="Cohort size"
              value={expected}
              onChange={e =>
                setExpected(e.target.value ? Number(e.target.value) : "")
              }
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={setLecturers.isPending || setRooms.isPending}
          >
            <Save size={14} /> Save assignment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AssignmentsPage() {
  const { semester } = useSemester();
  const utils = trpc.useUtils();
  const courses = trpc.courses.list.useQuery();
  const staff = trpc.staff.list.useQuery();
  const rooms = trpc.rooms.list.useQuery();
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [level, setLevel] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<CourseRow | null>(null);
  const auto = trpc.courses.autoAssignLecturers.useMutation({
    onSuccess: r => {
      toast.success(
        r.links
          ? `${r.links} lecturer assignments added from teaching profiles`
          : "Every course already matches its lecturers' teaching profiles"
      );
      utils.courses.list.invalidate();
    },
    onError: e => toast.error(friendlyError(e)),
  });
  const semCourses = (courses.data || []).filter(c => c.semester === semester);
  const list = useMemo(
    () =>
      semCourses
        .filter(c => (filter === "missing" ? !c.lecturers.length : true))
        .filter(c => !level || c.level === level)
        .filter(c =>
          `${c.code} ${c.name} ${c.lecturers.map(l => l.name).join(" ")}`
            .toLowerCase()
            .includes(q.toLowerCase())
        ),
    [semCourses, filter, level, q]
  );
  const load = useMemo(() => {
    const map = new Map<number, { hours: number; courses: string[] }>();
    for (const c of semCourses)
      for (const l of c.lecturers) {
        const share =
          (c.theoryHours + c.practicalHours) / Math.max(1, c.lecturers.length);
        const entry = map.get(l.staffId) || { hours: 0, courses: [] };
        entry.hours += share;
        entry.courses.push(c.code);
        map.set(l.staffId, entry);
      }
    return (staff.data || [])
      .map(p => ({
        ...p,
        hours: Math.round((map.get(p.id)?.hours || 0) * 10) / 10,
        courses: map.get(p.id)?.courses || [],
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [semCourses, staff.data]);
  const maxLoad = Math.max(1, ...load.map(l => l.hours));
  const assigned = semCourses.filter(c => c.lecturers.length).length;
  const roomName = (id?: number | null) =>
    rooms.data?.find(r => r.id === id)?.code;

  return (
    <>
      <PageHeader
        eyebrow="Course assigning"
        title="Lecturer & lecture hall assignment"
        description="Decide who teaches each course and which hall or lab it should prefer. The timetable generator uses these assignments when it places sessions."
        actions={
          <Button
            onClick={() => auto.mutate({ onlyUnassigned: false })}
            disabled={auto.isPending}
          >
            <Sparkles size={15} /> Auto-assign from teaching profiles
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="panel mb-4 flex flex-wrap items-center gap-3 p-4">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: `All (${semCourses.length})` },
                {
                  value: "missing",
                  label: `Needs lecturer (${semCourses.length - assigned})`,
                },
              ]}
            />
            <select
              className="field w-36"
              value={level}
              onChange={e => setLevel(Number(e.target.value))}
            >
              <option value={0}>All levels</option>
              {[1, 2, 3, 4].map(l => (
                <option key={l} value={l}>
                  Level {l}
                </option>
              ))}
            </select>
            <SearchBox
              value={q}
              onChange={setQ}
              className="min-w-[200px] flex-1"
              placeholder="Course or lecturer"
            />
          </div>
          {courses.isLoading ? (
            <Loading />
          ) : !list.length ? (
            <EmptyState
              icon={CheckCircle2}
              title={
                filter === "missing"
                  ? "Every course has a lecturer"
                  : "No courses"
              }
              description={
                filter === "missing"
                  ? "All courses in this semester are assigned."
                  : "Declare or import courses first."
              }
            />
          ) : (
            <div className="panel overflow-hidden">
              <Table>
                <thead>
                  <tr>
                    {[
                      "Course",
                      "Cohort",
                      "Hours",
                      "Lecturers",
                      "Hall / lab",
                      "",
                    ].map(h => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className={td}>
                        <span
                          className="mr-2 inline-block size-2 rounded-full"
                          style={{
                            backgroundColor: courseColor(c.code).border,
                          }}
                        />
                        <b>{c.code}</b>{" "}
                        <span className="text-muted-foreground">{c.name}</span>
                      </td>
                      <td className={cn(td, "whitespace-nowrap")}>
                        {c.cohort}
                      </td>
                      <td className={cn(td, "tabular whitespace-nowrap")}>
                        {c.theoryHours}T + {c.practicalHours}P
                      </td>
                      <td className={td}>
                        {c.lecturers.length ? (
                          <div className="flex flex-wrap gap-1">
                            {c.lecturers.map(l => (
                              <Pill
                                key={l.staffId}
                                tone={
                                  l.status === "on-leave"
                                    ? "red"
                                    : l.role === "coordinator"
                                      ? "plum"
                                      : "slate"
                                }
                              >
                                {l.name.replace(
                                  /^(Mr|Ms|Mrs|Dr|Prof)\.?\s*/i,
                                  ""
                                )}
                              </Pill>
                            ))}
                          </div>
                        ) : (
                          <Pill tone="gold">Not assigned</Pill>
                        )}
                      </td>
                      <td
                        className={cn(
                          td,
                          "text-xs whitespace-nowrap text-muted-foreground"
                        )}
                      >
                        {roomName(c.preferredRoomId) || "Any"}
                        {c.practicalHours
                          ? ` / ${roomName(c.practicalRoomId) || "any lab"}`
                          : ""}
                      </td>
                      <td className={cn(td, "text-right")}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOpen(c)}
                        >
                          <UserRoundCog size={14} /> Assign
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </div>
        <Panel
          title="Planned lecturer load"
          description={`Semester ${semester} · weekly hours shared between co-lecturers`}
        >
          <ul className="scrollbar-thin max-h-[640px] space-y-3 overflow-y-auto pr-1">
            {load.map(p => (
              <li key={p.id}>
                <div className="flex items-center justify-between text-sm">
                  <span
                    className={cn(
                      "truncate",
                      p.status !== "active" &&
                        "text-muted-foreground line-through"
                    )}
                  >
                    {p.name}
                  </span>
                  <b className="tabular">{p.hours} h</b>
                </div>
                <ProgressBar
                  value={(p.hours / maxLoad) * 100}
                  tone={p.hours > 14 ? "gold" : "plum"}
                  className="mt-1"
                />
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {p.courses.join(", ") || "No courses this semester"}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 size={12} /> Actual hours after generation are in
            Analytics → Lecturers.
          </p>
        </Panel>
      </div>
      <AssignDialog course={open} onClose={() => setOpen(null)} />
    </>
  );
}
