import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSemester } from "@/contexts/SemesterContext";
import { friendlyError, toMinutes, type SessionRow } from "@/lib/uov";
import { Field, Pill } from "./common";
import { TimeSlotPicker } from "./SessionDialog";
import { cn } from "@/lib/utils";

type FormState = {
  courseId: number | null;
  subjectCode: string;
  subjectName: string;
  program: "IT" | "AMC" | "COMMON";
  level: number;
  semester: number;
  classType: "Theory" | "Practical" | "Tutorial";
  scheduleType: "routine" | "temporary";
  sessionDate: string;
  day: string;
  startTime: string;
  endTime: string;
  staffIds: number[];
  roomId: number | null;
  participantCount: number;
  requirements: string;
  notes: string;
};

const cohortText = (program: string, level: number) =>
  program === "COMMON"
    ? `Level ${level} · IT + AMC`
    : `Level ${level} · ${program}`;

function useDebounced<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function SessionForm({
  open,
  onClose,
  session,
}: {
  open: boolean;
  onClose: () => void;
  session?: SessionRow | null;
}) {
  const { user } = useAuth();
  const { semester, academicYear } = useSemester();
  const utils = trpc.useUtils();
  const courses = trpc.courses.list.useQuery(undefined, { enabled: open });
  const staff = trpc.staff.list.useQuery(undefined, { enabled: open });
  const me = trpc.sessions.myStaffProfile.useQuery(undefined, {
    enabled: open && user?.role === "lecturer",
  });
  const blank = (): FormState => ({
    courseId: null,
    subjectCode: "",
    subjectName: "",
    program: "IT",
    level: 1,
    semester,
    classType: "Theory",
    scheduleType: "routine",
    sessionDate: "",
    day: "Monday",
    startTime: "08:30",
    endTime: "09:25",
    staffIds: me.data ? [me.data.id] : [],
    roomId: null,
    participantCount: 50,
    requirements: "",
    notes: "",
  });
  const [form, setForm] = useState<FormState>(blank);
  useEffect(() => {
    if (!open) return;
    if (session)
      setForm({
        courseId: session.courseId,
        subjectCode: session.subjectCode,
        subjectName: session.subjectName,
        program: (session.program as any) || "IT",
        level: session.level || 1,
        semester:
          Number(String(session.semester || "").match(/[12]/)?.[0]) || semester,
        classType: (session.classType as any) || "Theory",
        scheduleType: session.scheduleType,
        sessionDate: session.sessionDate || "",
        day: session.day,
        startTime: session.startTime,
        endTime: session.endTime,
        staffIds: session.staffIds,
        roomId: session.roomId,
        participantCount: session.participantCount,
        requirements: session.requirements || "",
        notes: session.notes || "",
      });
    else setForm(blank());
  }, [open, session?.id]);
  useEffect(() => {
    if (open && !session && me.data && !form.staffIds.length)
      setForm(f => ({ ...f, staffIds: [me.data!.id] }));
  }, [me.data?.id, open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));
  const payload = useMemo(
    () => ({
      id: session?.id,
      subjectCode: form.subjectCode.trim().toUpperCase(),
      subjectName: form.subjectName.trim(),
      department: form.program,
      academicYear,
      semester: `Semester ${form.semester}`,
      batch: cohortText(form.program, form.level),
      program: form.program,
      level: form.level,
      courseId: form.courseId,
      classType: form.classType,
      participantCount: Math.max(1, form.participantCount || 1),
      scheduleType: form.scheduleType,
      sessionDate:
        form.scheduleType === "temporary"
          ? form.sessionDate || undefined
          : undefined,
      day: form.day,
      startTime: form.startTime,
      endTime: form.endTime,
      durationMinutes: Math.max(
        1,
        toMinutes(form.endTime) - toMinutes(form.startTime)
      ),
      repeatWeekly: form.scheduleType === "routine",
      roomId: form.roomId,
      staffIds: form.staffIds,
      requirements: form.requirements || undefined,
      status: (session?.status || "scheduled") as
        | "scheduled"
        | "cancelled"
        | "rescheduled",
      notes: form.notes || undefined,
    }),
    [form, session?.id, academicYear]
  );
  const ready =
    payload.subjectCode.length >= 2 &&
    payload.subjectName.length >= 2 &&
    form.startTime < form.endTime;
  const debounced = useDebounced(payload);
  const check = trpc.sessions.conflicts.useQuery(debounced as any, {
    enabled: open && ready,
    retry: false,
  });
  const rooms = trpc.rooms.available.useQuery(
    {
      day: form.day,
      startTime: form.startTime,
      endTime: form.endTime,
      capacity: 0,
      kind: form.classType === "Practical" ? "lab" : "any",
      semester: form.semester,
      excludeSessionId: session?.id,
    },
    { enabled: open && form.startTime < form.endTime }
  );
  const onSaved = async (message: string) => {
    toast.success(message);
    await Promise.all([
      utils.sessions.list.invalidate(),
      utils.sessions.mine.invalidate(),
      utils.analytics.overview.invalidate(),
    ]);
    onClose();
  };
  const create = trpc.sessions.create.useMutation({
    onSuccess: () => onSaved("Session added to the timetable"),
    onError: e => toast.error(friendlyError(e), { duration: 9000 }),
  });
  const update = trpc.sessions.update.useMutation({
    onSuccess: () => onSaved("Session updated"),
    onError: e => toast.error(friendlyError(e), { duration: 9000 }),
  });
  const issues = check.data || [];

  const pickCourse = (id: number) => {
    const course = courses.data?.find(c => c.id === id);
    if (!course) return set("courseId", null);
    setForm(f => ({
      ...f,
      courseId: course.id,
      subjectCode: course.code,
      subjectName: course.name,
      program: course.program as any,
      level: course.level,
      semester: course.semester,
      participantCount: course.expectedStudents || f.participantCount,
      staffIds: f.staffIds.length
        ? f.staffIds
        : course.lecturers.map(l => l.staffId),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {session ? "Edit session" : "Add a session"}
          </DialogTitle>
          <DialogDescription>
            Manual sessions are checked against the same rules as the automatic
            generator.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Course from catalogue" className="sm:col-span-3">
              <select
                className="field"
                value={form.courseId ?? ""}
                onChange={e =>
                  e.target.value
                    ? pickCourse(Number(e.target.value))
                    : set("courseId", null)
                }
              >
                <option value="">— Other / extra session —</option>
                {(courses.data || [])
                  .filter(
                    c => c.semester === form.semester || c.id === form.courseId
                  )
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name} ({c.cohort})
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Code">
              <input
                className="field"
                value={form.subjectCode}
                onChange={e => set("subjectCode", e.target.value)}
                placeholder="IT1113"
              />
            </Field>
            <Field label="Title" className="sm:col-span-2">
              <input
                className="field"
                value={form.subjectName}
                onChange={e => set("subjectName", e.target.value)}
                placeholder="Course title"
              />
            </Field>
            <Field label="Programme">
              <select
                className="field"
                value={form.program}
                onChange={e => set("program", e.target.value as any)}
              >
                <option value="IT">IT</option>
                <option value="AMC">AMC</option>
                <option value="COMMON">Common (IT + AMC)</option>
              </select>
            </Field>
            <Field label="Level">
              <select
                className="field"
                value={form.level}
                onChange={e => set("level", Number(e.target.value))}
              >
                {[1, 2, 3, 4].map(l => (
                  <option key={l} value={l}>
                    Level {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Semester">
              <select
                className="field"
                value={form.semester}
                onChange={e => set("semester", Number(e.target.value))}
              >
                <option value={1}>Semester 1</option>
                <option value={2}>Semester 2</option>
              </select>
            </Field>
            <Field label="Class type">
              <select
                className="field"
                value={form.classType}
                onChange={e => set("classType", e.target.value as any)}
              >
                <option>Theory</option>
                <option>Practical</option>
                <option>Tutorial</option>
              </select>
            </Field>
            <Field label="Repeats">
              <select
                className="field"
                value={form.scheduleType}
                onChange={e => set("scheduleType", e.target.value as any)}
              >
                <option value="routine">Every week</option>
                <option value="temporary">One date only</option>
              </select>
            </Field>
            {form.scheduleType === "temporary" ? (
              <Field label="Date">
                <input
                  className="field"
                  type="date"
                  value={form.sessionDate}
                  onChange={e => set("sessionDate", e.target.value)}
                />
              </Field>
            ) : (
              <Field label="Expected students">
                <input
                  className="field"
                  type="number"
                  min={1}
                  value={form.participantCount}
                  onChange={e =>
                    set("participantCount", Number(e.target.value))
                  }
                />
              </Field>
            )}
          </div>
          <TimeSlotPicker
            classType={form.classType}
            day={form.day}
            start={form.startTime}
            end={form.endTime}
            onChange={v =>
              setForm(f => ({
                ...f,
                day: v.day,
                startTime: v.start,
                endTime: v.end,
              }))
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Lecture hall / lab">
              <select
                className="field"
                value={form.roomId ?? ""}
                onChange={e =>
                  set("roomId", e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Not assigned</option>
                {(rooms.data || []).map(room => (
                  <option
                    key={room.id}
                    value={room.id}
                    disabled={!room.free && room.id !== session?.roomId}
                  >
                    {room.code} · {room.name} ({room.capacity} seats)
                    {room.free ? "" : ` — busy: ${room.busyWith}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lecturers">
              <div className="scrollbar-thin max-h-28 overflow-y-auto rounded-lg border border-input bg-white p-2">
                {(staff.data || [])
                  .filter(
                    p => p.status === "active" || form.staffIds.includes(p.id)
                  )
                  .map(person => (
                    <label
                      key={person.id}
                      className="flex items-center gap-2 py-0.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.staffIds.includes(person.id)}
                        disabled={
                          user?.role === "lecturer" && person.id === me.data?.id
                        }
                        onChange={e =>
                          set(
                            "staffIds",
                            e.target.checked
                              ? [...form.staffIds, person.id]
                              : form.staffIds.filter(id => id !== person.id)
                          )
                        }
                      />
                      {person.name}
                    </label>
                  ))}
              </div>
            </Field>
            <Field
              label="Facilities needed"
              hint="Comma separated, e.g. projector, computer"
            >
              <input
                className="field"
                value={form.requirements}
                onChange={e => set("requirements", e.target.value)}
              />
            </Field>
            <Field label="Notes">
              <input
                className="field"
                value={form.notes}
                onChange={e => set("notes", e.target.value)}
              />
            </Field>
          </div>

          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              !ready
                ? "border-border bg-muted/50"
                : issues.length
                  ? "border-red-200 bg-red-50"
                  : "border-emerald-200 bg-emerald-50"
            )}
          >
            {!ready ? (
              <p className="text-muted-foreground">
                Fill in the course code, title and a valid time to run the
                conflict check.
              </p>
            ) : check.isFetching ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="animate-spin" size={14} /> Checking cohort,
                lecturer, hall and university rules…
              </p>
            ) : issues.length ? (
              <div>
                <p className="flex items-center gap-2 font-semibold text-red-800">
                  <TriangleAlert size={15} /> {issues.length} issue
                  {issues.length > 1 ? "s" : ""} must be resolved
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-red-900">
                  {issues.map(issue => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 font-semibold text-emerald-800">
                <CheckCircle2 size={15} /> No conflicts — this slot is free for
                the cohort, lecturer and hall.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Pill tone="slate">{cohortText(form.program, form.level)}</Pill>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={
                  !ready ||
                  create.isPending ||
                  update.isPending ||
                  issues.length > 0
                }
                onClick={() =>
                  session
                    ? update.mutate({ ...(payload as any), id: session.id })
                    : create.mutate(payload as any)
                }
              >
                {(create.isPending || update.isPending) && (
                  <Loader2 className="animate-spin" size={14} />
                )}
                {session ? "Save changes" : "Add session"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
