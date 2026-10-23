import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  FlaskConical,
  GraduationCap,
  Library,
  Mail,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserRound,
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
import { useAuth } from "@/_core/hooks/useAuth";
import { useSemester } from "@/contexts/SemesterContext";
import {
  courseColor,
  downloadCsv,
  friendlyError,
  PROGRAM_NAMES,
  sortSessions,
  type CourseRow,
} from "@/lib/uov";
import {
  ConfirmButton,
  EmptyState,
  Field,
  KeyValue,
  Loading,
  PageHeader,
  Panel,
  Pill,
  SearchBox,
  Segmented,
  Table,
  td,
  th,
} from "@/components/app/common";
import { cn } from "@/lib/utils";

type Editable = {
  id?: number;
  code: string;
  name: string;
  credits: number;
  program: "IT" | "AMC" | "COMMON";
  level: number;
  semester: number;
  category: "core" | "elective" | "optional";
  theoryHours: number;
  practicalHours: number;
  expectedStudents: number | null;
  description: string;
  objective: string;
  learningOutcomes: string;
  contents: string;
  prerequisites: string;
  teachingMethods: string;
  evaluation: string;
  readings: string;
  active: boolean;
};
const blank: Editable = {
  code: "",
  name: "",
  credits: 3,
  program: "IT",
  level: 1,
  semester: 1,
  category: "core",
  theoryHours: 2,
  practicalHours: 0,
  expectedStudents: null,
  description: "",
  objective: "",
  learningOutcomes: "",
  contents: "",
  prerequisites: "",
  teachingMethods: "",
  evaluation: "",
  readings: "",
  active: true,
};

function CourseEditor({
  open,
  onClose,
  course,
}: {
  open: boolean;
  onClose: () => void;
  course: CourseRow | null;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<Editable>(blank);
  const [lookupCode, setLookupCode] = useState("");
  const handbook = trpc.courses.handbookLookup.useQuery(
    { code: lookupCode },
    { enabled: lookupCode.length >= 5 }
  );
  useEffect(() => {
    if (!open) return;
    setForm(
      course
        ? {
            id: course.id,
            code: course.code,
            name: course.name,
            credits: course.credits,
            program: course.program as any,
            level: course.level,
            semester: course.semester,
            category: course.category as any,
            theoryHours: course.theoryHours,
            practicalHours: course.practicalHours,
            expectedStudents: course.expectedStudents ?? null,
            description: course.description || "",
            objective: course.objective || "",
            learningOutcomes: course.learningOutcomes.join("\n"),
            contents: course.contents || "",
            prerequisites: course.prerequisites || "",
            teachingMethods: course.teachingMethods || "",
            evaluation: course.evaluation || "",
            readings: course.readings.join("\n"),
            active: course.active !== 0,
          }
        : blank
    );
  }, [open, course?.id]);
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) =>
    setForm(f => ({ ...f, [k]: v }));
  const onCodeBlur = () => {
    const code = form.code.trim().toUpperCase();
    const m = code.match(/(\d)(\d)\d(\d)$/);
    if (!course && m)
      setForm(f => ({
        ...f,
        code,
        level: Number(m[1]) || f.level,
        semester: [1, 2].includes(Number(m[2])) ? Number(m[2]) : f.semester,
        credits: Number(m[3]) || f.credits,
        program: code.startsWith("ACU")
          ? "COMMON"
          : /^(AMA|PMA|STA|CSC|CSH)/.test(code)
            ? "AMC"
            : "IT",
        category: code.startsWith("EL") ? "elective" : f.category,
      }));
    setLookupCode(code);
  };
  const fillFromHandbook = () => {
    const h = handbook.data;
    if (!h) return;
    setForm(f => ({
      ...f,
      name: f.name || h.title,
      objective: h.objective || f.objective,
      learningOutcomes: h.learningOutcomes.join("\n") || f.learningOutcomes,
      contents: h.contents || f.contents,
      prerequisites: h.prerequisites || f.prerequisites,
      teachingMethods: h.teachingMethods || f.teachingMethods,
      evaluation: h.evaluation || f.evaluation,
      readings: h.readings.join("\n") || f.readings,
    }));
    toast.success("Details copied from the faculty handbook");
  };
  const done = async (msg: string) => {
    toast.success(msg);
    await utils.courses.list.invalidate();
    onClose();
  };
  const create = trpc.courses.create.useMutation({
    onSuccess: () => done("Course declared"),
    onError: e => toast.error(friendlyError(e)),
  });
  const update = trpc.courses.update.useMutation({
    onSuccess: () => done("Course updated"),
    onError: e => toast.error(friendlyError(e)),
  });
  const save = () => {
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      credits: Number(form.credits) || 0,
      program: form.program,
      level: form.level,
      semester: form.semester,
      category: form.category,
      theoryHours: Number(form.theoryHours) || 0,
      practicalHours: Number(form.practicalHours) || 0,
      expectedStudents: form.expectedStudents || null,
      description: form.description || null,
      objective: form.objective || null,
      learningOutcomes: form.learningOutcomes
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean),
      contents: form.contents || null,
      prerequisites: form.prerequisites || null,
      teachingMethods: form.teachingMethods || null,
      evaluation: form.evaluation || null,
      readings: form.readings
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean),
      active: form.active,
    };
    if (form.id) update.mutate({ ...payload, id: form.id });
    else create.mutate(payload);
  };
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {course ? `Edit ${course.code}` : "Declare a course"}
          </DialogTitle>
          <DialogDescription>
            Weekly hours drive the automatic timetable: each theory hour is a
            55-minute lecture, practical hours are grouped into 2-hour lab
            blocks.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Course code">
            <input
              className="field"
              value={form.code}
              onChange={e => set("code", e.target.value)}
              onBlur={onCodeBlur}
              placeholder="IT1113"
            />
          </Field>
          <Field label="Course title" className="sm:col-span-3">
            <input
              className="field"
              value={form.name}
              onChange={e => set("name", e.target.value)}
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
          <Field label="Category">
            <select
              className="field"
              value={form.category}
              onChange={e => set("category", e.target.value as any)}
            >
              <option value="core">Core (compulsory)</option>
              <option value="elective">Elective</option>
              <option value="optional">Optional</option>
            </select>
          </Field>
          <Field label="Credits">
            <input
              className="field"
              type="number"
              min={0}
              value={form.credits}
              onChange={e => set("credits", Number(e.target.value))}
            />
          </Field>
          <Field label="Theory h / week">
            <input
              className="field"
              type="number"
              min={0}
              value={form.theoryHours}
              onChange={e => set("theoryHours", Number(e.target.value))}
            />
          </Field>
          <Field label="Practical h / week">
            <input
              className="field"
              type="number"
              min={0}
              value={form.practicalHours}
              onChange={e => set("practicalHours", Number(e.target.value))}
            />
          </Field>
          <Field label="Expected students" hint="Blank = cohort size">
            <input
              className="field"
              type="number"
              min={0}
              value={form.expectedStudents ?? ""}
              onChange={e =>
                set(
                  "expectedStudents",
                  e.target.value ? Number(e.target.value) : null
                )
              }
            />
          </Field>
        </div>
        {handbook.data && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <span>
              <b>{handbook.data.code}</b> is described in the faculty handbook —
              objective, {handbook.data.learningOutcomes.length} learning
              outcomes, contents and readings are available.
            </span>
            <Button size="sm" variant="outline" onClick={fillFromHandbook}>
              <BookMarked size={14} /> Use handbook details
            </Button>
          </div>
        )}
        <div className="grid gap-3">
          <Field label="Course description / summary">
            <textarea
              className="field"
              value={form.description}
              onChange={e => set("description", e.target.value)}
            />
          </Field>
          <Field label="Objective">
            <textarea
              className="field"
              value={form.objective}
              onChange={e => set("objective", e.target.value)}
            />
          </Field>
          <Field label="Intended learning outcomes" hint="One outcome per line">
            <textarea
              className="field min-h-32"
              value={form.learningOutcomes}
              onChange={e => set("learningOutcomes", e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Prerequisites"
              hint="Course codes, e.g. STA1113, CSH3273"
            >
              <input
                className="field"
                value={form.prerequisites}
                onChange={e => set("prerequisites", e.target.value)}
              />
            </Field>
            <Field label="Status">
              <select
                className="field"
                value={form.active ? "1" : "0"}
                onChange={e => set("active", e.target.value === "1")}
              >
                <option value="1">Offered (included in generation)</option>
                <option value="0">Not offered this year</option>
              </select>
            </Field>
          </div>
          <Field label="Contents">
            <textarea
              className="field"
              value={form.contents}
              onChange={e => set("contents", e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Teaching & learning methods">
              <textarea
                className="field"
                value={form.teachingMethods}
                onChange={e => set("teachingMethods", e.target.value)}
              />
            </Field>
            <Field label="Evaluation">
              <textarea
                className="field"
                value={form.evaluation}
                onChange={e => set("evaluation", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Recommended readings" hint="One per line">
            <textarea
              className="field"
              value={form.readings}
              onChange={e => set("readings", e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !form.code || !form.name || create.isPending || update.isPending
            }
            onClick={save}
          >
            {course ? "Save course" : "Declare course"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminCatalogue() {
  const [, setLocation] = useLocation();
  const { semester } = useSemester();
  const utils = trpc.useUtils();
  const courses = trpc.courses.list.useQuery();
  const [scope, setScope] = useState<"semester" | "all">("semester");
  const [program, setProgram] = useState("all");
  const [level, setLevel] = useState(0);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [creating, setCreating] = useState(false);
  const remove = trpc.courses.delete.useMutation({
    onSuccess: () => {
      toast.success("Course removed");
      utils.courses.list.invalidate();
    },
    onError: e => toast.error(friendlyError(e)),
  });
  const handbook = trpc.courses.applyHandbook.useMutation({
    onSuccess: r => {
      toast.success(`${r.updated} courses enriched with handbook details`);
      utils.courses.list.invalidate();
    },
    onError: e => toast.error(friendlyError(e)),
  });
  const list = useMemo(() => {
    let rows = courses.data || [];
    if (scope === "semester") rows = rows.filter(c => c.semester === semester);
    if (program !== "all") rows = rows.filter(c => c.program === program);
    if (level) rows = rows.filter(c => c.level === level);
    const s = q.trim().toLowerCase();
    if (s)
      rows = rows.filter(c =>
        `${c.code} ${c.name} ${c.lecturers.map(l => l.name).join(" ")}`
          .toLowerCase()
          .includes(s)
      );
    return rows;
  }, [courses.data, scope, semester, program, level, q]);
  return (
    <>
      <PageHeader
        eyebrow="Course declaring"
        title="Course catalogue"
        description="Every course unit offered by the department — credits, weekly hours, cohort, learning outcomes and lecturers. The timetable generator reads directly from this list."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handbook.mutate({ overwrite: false })}
              disabled={handbook.isPending}
            >
              <BookMarked size={14} /> Fill details from handbook
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "uov-courses.csv",
                  list.map(c => ({
                    subjectCode: c.code,
                    subjectName: c.name,
                    totalCredit: c.credits,
                    program: c.program,
                    batch: `${["", "1st", "2nd", "3rd", "4th"][c.level]} year`,
                    semester: `Semester ${c.semester}`,
                    category: c.category,
                    weeklyHours: c.theoryHours + c.practicalHours,
                    theoryHours: c.theoryHours,
                    practicalHours: c.practicalHours,
                    lecturers: c.lecturers.map(l => l.staffCode).join(";"),
                    prerequisites: c.prerequisites || "",
                  }))
                )
              }
            >
              <FileSpreadsheet size={14} /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/import?tab=courses")}
            >
              Bulk import
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> Declare course
            </Button>
          </>
        }
      />
      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "semester", label: `Semester ${semester}` },
            { value: "all", label: "Whole catalogue" },
          ]}
        />
        <select
          className="field w-44"
          value={program}
          onChange={e => setProgram(e.target.value)}
        >
          <option value="all">All programmes</option>
          <option value="IT">IT</option>
          <option value="AMC">AMC</option>
          <option value="COMMON">Common</option>
        </select>
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
          placeholder="Code, title or lecturer"
          className="min-w-[220px] flex-1"
        />
      </div>
      {courses.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState
          icon={BookOpen}
          title="No courses found"
          description="Import the course list CSV or declare a course."
          action={
            <Button onClick={() => setLocation("/import?tab=courses")}>
              Import courses
            </Button>
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
                  "Sem",
                  "Type",
                  "Credits",
                  "Theory",
                  "Practical",
                  "Lecturers",
                  "Timetable",
                  "",
                ].map(h => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(c => {
                const required =
                  c.theoryHours + Math.ceil(c.practicalHours / 2);
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      "hover:bg-muted/30",
                      !c.active && "opacity-50"
                    )}
                  >
                    <td className={cn(td, "min-w-[280px]")}>
                      <Link
                        href={`/courses/${c.id}`}
                        className="group flex items-center gap-2"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: courseColor(c.code).border,
                          }}
                        />
                        <span>
                          <b className="group-hover:text-primary group-hover:underline">
                            {c.code}
                          </b>{" "}
                          <span className="text-muted-foreground">
                            {c.name}
                          </span>
                          {c.learningOutcomes.length > 0 && (
                            <Target
                              size={12}
                              className="ml-1 inline text-emerald-600"
                            />
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>{c.cohort}</td>
                    <td className={td}>S{c.semester}</td>
                    <td className={td}>
                      <Pill tone={c.category === "core" ? "slate" : "green"}>
                        {c.category}
                      </Pill>
                    </td>
                    <td className={cn(td, "tabular")}>{c.credits}</td>
                    <td className={cn(td, "tabular")}>{c.theoryHours}h</td>
                    <td className={cn(td, "tabular")}>{c.practicalHours}h</td>
                    <td className={cn(td, "max-w-[220px] text-xs")}>
                      {c.lecturers.length ? (
                        c.lecturers.map(l => l.name).join(", ")
                      ) : (
                        <Pill tone="gold">Not assigned</Pill>
                      )}
                    </td>
                    <td className={td}>
                      {!required ? (
                        <Pill>No weekly hours</Pill>
                      ) : c.scheduledSessions >= required ? (
                        <Pill tone="green">{c.scheduledSessions} sessions</Pill>
                      ) : (
                        <Pill tone={c.scheduledSessions ? "gold" : "slate"}>
                          {c.scheduledSessions}/{required}
                        </Pill>
                      )}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right")}>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditing(c)}
                        aria-label="Edit"
                      >
                        <Pencil size={14} />
                      </Button>
                      <ConfirmButton
                        size="icon-sm"
                        variant="ghost"
                        title={`Remove ${c.code}?`}
                        description="The course and its lecturer assignments are removed from the catalogue. Existing timetable sessions stay until the timetable is regenerated."
                        confirmLabel="Remove"
                        onConfirm={() => remove.mutate({ id: c.id })}
                      >
                        <Trash2 size={14} />
                      </ConfirmButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            {list.length} courses · {list.reduce((s, c) => s + c.credits, 0)}{" "}
            credits ·{" "}
            {list.reduce((s, c) => s + c.theoryHours + c.practicalHours, 0)}{" "}
            weekly hours
          </p>
        </div>
      )}
      <CourseEditor
        open={creating || Boolean(editing)}
        course={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function MyCourses() {
  const { user } = useAuth();
  const { semester } = useSemester();
  const courses = trpc.courses.mine.useQuery();
  const [scope, setScope] = useState<"semester" | "all">("semester");
  const list = (courses.data || [])
    .filter(c => scope === "all" || c.semester === semester)
    .sort(
      (a, b) =>
        a.semester - b.semester ||
        Number(a.category !== "core") - Number(b.category !== "core") ||
        a.code.localeCompare(b.code)
    );
  return (
    <>
      <PageHeader
        eyebrow={
          user?.role === "student"
            ? user.level
              ? `Level ${user.level} · ${PROGRAM_NAMES[user.program || "IT"]}`
              : "Student"
            : "Lecturer"
        }
        title={user?.role === "student" ? "My courses" : "Courses I teach"}
        description="Course descriptions, intended learning outcomes, credits, prerequisites, lecturers and the timetable for each course."
        actions={
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "semester", label: `Semester ${semester}` },
              { value: "all", label: "Both semesters" },
            ]}
          />
        }
      />
      {courses.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState
          icon={BookOpen}
          title="No courses to show"
          description={
            user?.role === "student"
              ? "Your level/programme may not be set on your account yet."
              : "No courses are assigned to you yet."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map(c => {
            const color = courseColor(c.code);
            return (
              <Link
                key={c.id}
                href={`/courses/${c.id}`}
                className="panel group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className="h-1.5"
                  style={{ backgroundColor: color.border }}
                />
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-bold"
                      style={{ backgroundColor: color.bg, color: color.text }}
                    >
                      {c.code}
                    </span>
                    <span className="flex gap-1">
                      {c.category !== "core" && (
                        <Pill tone="green">{c.category}</Pill>
                      )}
                      <Pill>S{c.semester}</Pill>
                    </span>
                  </div>
                  <h3 className="mt-3 text-base leading-snug font-bold group-hover:text-primary">
                    {c.name}
                  </h3>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">
                    {c.objective ||
                      c.description ||
                      "Course details have not been added yet."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>
                      <b className="text-foreground">{c.credits}</b> credits
                    </span>
                    <span>
                      <b className="text-foreground">{c.theoryHours}</b>h theory
                    </span>
                    {c.practicalHours > 0 && (
                      <span>
                        <b className="text-foreground">{c.practicalHours}</b>h
                        lab
                      </span>
                    )}
                    {c.learningOutcomes.length > 0 && (
                      <span className="text-emerald-700">
                        {c.learningOutcomes.length} outcomes
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export function CourseDetailPage() {
  const [, params] = useRoute("/courses/:id");
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const detail = trpc.courses.detail.useQuery(
    { id },
    { enabled: Number.isFinite(id) }
  );
  const [editing, setEditing] = useState(false);
  const courses = trpc.courses.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  if (detail.isLoading) return <Loading />;
  if (!detail.data)
    return (
      <EmptyState
        title="Course not found"
        action={
          <Button onClick={() => setLocation("/courses")}>
            Back to courses
          </Button>
        }
      />
    );
  const c = detail.data;
  const color = courseColor(c.code);
  const sessions = sortSessions(
    c.sessions.filter(s => s.status !== "cancelled")
  );
  return (
    <>
      <button
        onClick={() =>
          history.length > 1 ? history.back() : setLocation("/courses")
        }
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={15} /> Back
      </button>
      <div className="panel mb-6 overflow-hidden">
        <div className="h-2" style={{ backgroundColor: color.border }} />
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-md px-2.5 py-1 text-sm font-bold"
                style={{ backgroundColor: color.bg, color: color.text }}
              >
                {c.code}
              </span>
              <Pill tone={c.category === "core" ? "plum" : "green"}>
                {c.category === "core" ? "Compulsory" : c.category}
              </Pill>
              {!c.active && <Pill tone="red">Not offered</Pill>}
            </div>
            <h1 className="mt-3 text-2xl font-bold md:text-3xl">{c.name}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {c.programName} · Level {c.level} · Semester {c.semester}
            </p>
          </div>
          {user?.role === "admin" && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Edit course
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border p-4 sm:grid-cols-5">
          <KeyValue label="Credits" value={c.credits} />
          <KeyValue label="Theory" value={`${c.theoryHours} h / week`} />
          <KeyValue
            label="Practical"
            value={c.practicalHours ? `${c.practicalHours} h / week` : "None"}
          />
          <KeyValue label="Cohort" value={c.cohort} />
          <KeyValue
            label="Credit breakdown"
            value={c.creditDetail || `${c.credits} credits`}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {(c.description || c.objective) && (
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <Target size={16} className="text-primary" /> Objective
                </span>
              }
            >
              {c.description && (
                <p className="mb-3 text-sm leading-7">{c.description}</p>
              )}
              {c.objective && (
                <p className="text-sm leading-7">{c.objective}</p>
              )}
            </Panel>
          )}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <ClipboardCheck size={16} className="text-primary" /> Intended
                learning outcomes
              </span>
            }
            description="On successful completion of the course, students should be able to:"
          >
            {c.learningOutcomes.length ? (
              <ol className="space-y-2.5">
                {c.learningOutcomes.map((o, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-6">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="first-letter:uppercase">{o}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                Learning outcomes have not been added for this course yet.
              </p>
            )}
          </Panel>
          {c.contents && (
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <BookOpen size={16} className="text-primary" /> Course
                  contents
                </span>
              }
            >
              <p className="text-sm leading-7 whitespace-pre-line">
                {c.contents.replace(/\s*•\s*/g, "\n• ").trim()}
              </p>
            </Panel>
          )}
          {(c.teachingMethods || c.evaluation) && (
            <div className="grid gap-6 md:grid-cols-2">
              {c.teachingMethods && (
                <Panel title="Teaching & learning methods">
                  <p className="text-sm leading-6">{c.teachingMethods}</p>
                </Panel>
              )}
              {c.evaluation && (
                <Panel title="Evaluation">
                  <p className="text-sm leading-6">{c.evaluation}</p>
                </Panel>
              )}
            </div>
          )}
          {c.readings.length > 0 && (
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <Library size={16} className="text-primary" /> Recommended
                  readings
                </span>
              }
            >
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6">
                {c.readings.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <CalendarDays size={16} className="text-primary" /> Weekly
                timetable
              </span>
            }
          >
            {sessions.length ? (
              <ul className="space-y-2">
                {sessions.map(s => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                  >
                    <div className="w-12 text-center">
                      <p className="text-xs font-bold">{s.day.slice(0, 3)}</p>
                      <p className="text-[11px] text-muted-foreground tabular">
                        {s.startTime}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="flex items-center gap-1.5 font-semibold">
                        {s.classType === "Practical" ? (
                          <FlaskConical size={13} className="text-amber-600" />
                        ) : (
                          <BookOpen size={13} className="text-primary" />
                        )}
                        {s.classType} · {s.startTime}–{s.endTime}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.room ? `${s.room.code} ${s.room.name}` : "Hall TBA"}{" "}
                        · {s.staff.map(p => p.name).join(", ") || "TBA"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not scheduled in the timetable yet.
              </p>
            )}
          </Panel>
          <Panel
            title={
              <span className="flex items-center gap-2">
                <UserRound size={16} className="text-primary" /> Lecturers
              </span>
            }
          >
            {c.lecturers.length ? (
              <ul className="space-y-3">
                {c.lecturers.map(l => (
                  <li key={l.staffId} className="flex gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {l.name
                        .replace(/^(Mr|Ms|Mrs|Dr|Prof)\.?\s*/i, "")
                        .slice(0, 1)}
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.title}
                        {l.role === "coordinator"
                          ? " · Course coordinator"
                          : ""}
                        {l.component !== "both" ? ` · ${l.component}` : ""}
                      </p>
                      {l.qualification && (
                        <p className="text-xs text-muted-foreground">
                          {l.qualification}
                        </p>
                      )}
                      {l.email && (
                        <a
                          href={`mailto:${l.email}`}
                          className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Mail size={11} /> {l.email}
                        </a>
                      )}
                      {l.telephone && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone size={11} /> {l.telephone}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Lecturer to be announced.
              </p>
            )}
          </Panel>
          <Panel
            title={
              <span className="flex items-center gap-2">
                <GraduationCap size={16} className="text-primary" />{" "}
                Prerequisites
              </span>
            }
          >
            {c.prerequisiteCourses.length ? (
              <ul className="space-y-1.5 text-sm">
                {c.prerequisiteCourses.map(p => (
                  <li key={p.code}>
                    {p.id ? (
                      <Link
                        href={`/courses/${p.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {p.code}
                      </Link>
                    ) : (
                      <b>{p.code}</b>
                    )}{" "}
                    <span className="text-muted-foreground">{p.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {c.prerequisites || "No prerequisites."}
              </p>
            )}
            {c.requiredBy.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="label">Required for</p>
                <ul className="space-y-1 text-sm">
                  {c.requiredBy.map(r => (
                    <li key={r.id}>
                      <Link
                        href={`/courses/${r.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {r.code}
                      </Link>{" "}
                      <span className="text-muted-foreground">{r.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
          {c.inHandbook && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles size={12} /> Details sourced from the Faculty of Applied
              Science handbook 2024/2025.
            </p>
          )}
        </div>
      </div>
      {user?.role === "admin" && (
        <CourseEditor
          open={editing}
          onClose={() => {
            setEditing(false);
            detail.refetch();
          }}
          course={courses.data?.find(x => x.id === c.id) || null}
        />
      )}
    </>
  );
}

export default function CoursesPage() {
  const { user } = useAuth();
  return user?.role === "admin" ? <AdminCatalogue /> : <MyCourses />;
}
