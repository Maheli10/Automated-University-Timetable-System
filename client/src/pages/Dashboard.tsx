import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  GaugeCircle,
  GraduationCap,
  Layers,
  Megaphone,
  Scale,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSemester } from "@/contexts/SemesterContext";
import {
  courseColor,
  greeting,
  sortSessions,
  todayName,
  type SessionRow,
} from "@/lib/uov";
import {
  EmptyState,
  Loading,
  PageHeader,
  Panel,
  Pill,
  ProgressBar,
  StatCard,
} from "@/components/app/common";
import WeeklyGrid from "@/components/app/WeeklyGrid";
import SessionDialog from "@/components/app/SessionDialog";
import { cn } from "@/lib/utils";

function TodayList({
  sessions,
  onSelect,
  emptyText,
}: {
  sessions: SessionRow[];
  onSelect: (s: SessionRow) => void;
  emptyText: string;
}) {
  const today = todayName();
  const list = sortSessions(
    sessions.filter(s => s.day === today && s.status !== "cancelled")
  );
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (!today)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        It's the weekend — no classes today.
      </p>
    );
  if (!list.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  return (
    <ol className="space-y-2">
      {list.map(s => {
        const [sh, sm] = s.startTime.split(":").map(Number);
        const [eh, em] = s.endTime.split(":").map(Number);
        const live = nowMinutes >= sh * 60 + sm && nowMinutes < eh * 60 + em;
        const past = nowMinutes >= eh * 60 + em;
        const color = courseColor(s.subjectCode);
        return (
          <li key={s.id}>
            <button
              onClick={() => onSelect(s)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-border bg-white p-3 text-left transition hover:border-primary/30 hover:shadow-sm",
                past && "opacity-55"
              )}
            >
              <div className="w-14 shrink-0 text-center">
                <p className="text-sm font-bold tabular">{s.startTime}</p>
                <p className="text-[11px] text-muted-foreground tabular">
                  {s.endTime}
                </p>
              </div>
              <div
                className="h-10 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: color.border }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {s.subjectCode} · {s.subjectName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.room ? `${s.room.code} ${s.room.name}` : "Room TBA"} ·{" "}
                  {s.staff.map(p => p.name).join(", ") || "Lecturer TBA"} ·{" "}
                  {s.batch}
                </p>
              </div>
              {live ? (
                <Pill tone="green">Now</Pill>
              ) : s.classType === "Practical" ? (
                <Pill tone="gold">Lab</Pill>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function NoticesMini() {
  const notices = trpc.notices.list.useQuery();
  const list = (notices.data || []).slice(0, 4);
  return (
    <Panel
      title="Latest notices"
      actions={
        <Link
          href="/notices"
          className="text-xs font-semibold text-primary hover:underline"
        >
          View all
        </Link>
      }
    >
      {!list.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No notices yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map(n => (
            <li key={n.id} className="flex gap-3">
              <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                <Megaphone size={15} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{n.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {n.message}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                  {new Date(n.createdAt as any).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AdminDashboard() {
  const { user } = useAuth();
  const { semester, academicYear } = useSemester();
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const analytics = trpc.analytics.overview.useQuery({ semester });
  const readiness = trpc.timetable.readiness.useQuery({ semester });
  const sessions = trpc.sessions.list.useQuery({ semester });
  const users = trpc.users.list.useQuery();
  const rooms = trpc.rooms.list.useQuery();
  const staff = trpc.staff.list.useQuery();
  const swaps = trpc.swaps.list.useQuery();
  const pending = (swaps.data || []).filter(s => s.status === "pending");
  const a = analytics.data;
  const r = readiness.data;
  const students = (users.data || []).filter(u => u.role === "student").length;
  const steps = [
    {
      done: (rooms.data?.length || 0) > 0,
      label: "Lecture halls & labs added",
      hint: `${rooms.data?.length || 0} rooms`,
      path: "/import?tab=rooms",
    },
    {
      done: (r?.courses || 0) > 0,
      label: "Courses declared for this semester",
      hint: `${r?.courses || 0} courses`,
      path: "/import?tab=courses",
    },
    {
      done: (staff.data?.length || 0) > 0,
      label: "Lecturers imported",
      hint: `${staff.data?.length || 0} lecturers`,
      path: "/import?tab=lecturers",
    },
    {
      done: Boolean(r && r.teachable && !r.noLecturer.length),
      label: "Every course has a lecturer",
      hint: r ? `${r.noLecturer.length} without lecturer` : "",
      path: "/assignments",
    },
    {
      done: students > 0,
      label: "Student accounts created",
      hint: `${students} students`,
      path: "/import?tab=students",
    },
    {
      done: (a?.summary.sessions || 0) > 0,
      label: "Timetable generated",
      hint: a ? `${a.summary.sessions} weekly sessions` : "",
      path: "/generate",
    },
  ];
  const completed = steps.filter(s => s.done).length;
  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        title={`${greeting()}, ${user?.name?.split(" ")[0] || "Administrator"}`}
        description={`Timetable operations for ${academicYear || "the current academic year"} · Semester ${semester}.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setLocation("/analytics")}>
              <GaugeCircle size={15} /> Analytics
            </Button>
            <Button onClick={() => setLocation("/generate")}>
              <Sparkles size={15} /> Generate timetable
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <StatCard
          label="Courses this semester"
          value={a?.summary.courses ?? "—"}
          hint={`${a?.summary.totalCourses ?? 0} in catalogue`}
          icon={BookOpen}
          onClick={() => setLocation("/courses")}
        />
        <StatCard
          label="Weekly sessions"
          value={a?.summary.sessions ?? "—"}
          hint={`${a?.summary.weeklyHours ?? 0} teaching hours`}
          icon={CalendarDays}
          tone="blue"
          onClick={() => setLocation("/timetable")}
        />
        <StatCard
          label="Hours scheduled"
          value={a ? `${a.summary.coverage}%` : "—"}
          hint={a ? `${a.summary.unscheduledCourses} courses incomplete` : ""}
          icon={Layers}
          tone="green"
          onClick={() => setLocation("/analytics?tab=unscheduled")}
        />
        <StatCard
          label="Clashes"
          value={a?.summary.conflicts ?? "—"}
          hint={`${a?.summary.warnings ?? 0} warnings`}
          icon={AlertTriangle}
          tone={a?.summary.conflicts ? "red" : "slate"}
          onClick={() => setLocation("/analytics?tab=conflicts")}
        />
        <StatCard
          label="Room utilisation"
          value={a ? `${a.summary.roomUtilization}%` : "—"}
          hint={`${rooms.data?.length || 0} halls & labs`}
          icon={Building2}
          tone="gold"
          onClick={() => setLocation("/analytics?tab=rooms")}
        />
        <StatCard
          label="Lecturer balance"
          value={a ? `${a.summary.lecturerBalance}` : "—"}
          hint="Score out of 100"
          icon={Scale}
          tone="plum"
          onClick={() => setLocation("/analytics?tab=lecturers")}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Happening today"
          description={todayName() ? `${todayName()} · all cohorts` : "Weekend"}
          actions={
            <Link
              href="/timetable"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Full timetable
            </Link>
          }
        >
          {sessions.isLoading ? (
            <Loading />
          ) : (
            <TodayList
              sessions={sessions.data || []}
              onSelect={setSelected}
              emptyText="No sessions are scheduled today."
            />
          )}
        </Panel>
        <div className="space-y-6">
          <Panel
            title="Semester setup"
            description={`${completed} of ${steps.length} steps complete`}
          >
            <ProgressBar
              value={(completed / steps.length) * 100}
              className="mb-4"
            />
            <ul className="space-y-1">
              {steps.map(step => (
                <li key={step.label}>
                  <button
                    onClick={() => setLocation(step.path)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                  >
                    {step.done ? (
                      <CheckCircle2 size={17} className="text-emerald-600" />
                    ) : (
                      <Circle size={17} className="text-muted-foreground/50" />
                    )}
                    <span
                      className={cn(
                        "flex-1 text-sm",
                        step.done ? "text-muted-foreground" : "font-semibold"
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {step.hint}
                    </span>
                    <ArrowRight size={14} className="text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {pending.length > 0 && (
            <Panel
              title="Waiting for your decision"
              actions={
                <Link
                  href="/requests"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Review
                </Link>
              }
            >
              <ul className="space-y-2">
                {pending.slice(0, 3).map(p => (
                  <li
                    key={p.id}
                    className="rounded-lg bg-muted/60 px-3 py-2 text-sm"
                  >
                    <b>{p.requesterName}</b> wants to move{" "}
                    {p.session?.subjectCode || "a session"} to {p.requestedDay}{" "}
                    {p.requestedStartTime}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <NoticesMini />
        </div>
      </div>

      {a && (
        <div className="mt-6">
          <Panel
            title="Weekly load by cohort"
            description="Teaching hours per student batch this semester (of 35 available periods)"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {a.batches
                .filter(b => b.declaredCourses || b.sessions)
                .map(b => (
                  <div
                    key={b.cohort}
                    className="rounded-xl border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{b.label}</p>
                      <Pill tone={b.program === "IT" ? "plum" : "blue"}>
                        {b.program}
                      </Pill>
                    </div>
                    <p className="mt-2 text-xl font-bold tabular">
                      {b.hours}
                      <span className="text-xs font-medium text-muted-foreground">
                        {" "}
                        h/week
                      </span>
                    </p>
                    <ProgressBar
                      value={(b.hours / 35) * 100}
                      className="mt-2"
                      tone={b.hours > 30 ? "gold" : "plum"}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {b.courses} courses · {b.practicalHours} h lab ·{" "}
                      {b.freePeriods} free periods
                    </p>
                  </div>
                ))}
            </div>
          </Panel>
        </div>
      )}
      <SessionDialog session={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function PersonalDashboard() {
  const { user } = useAuth();
  const { semester, academicYear } = useSemester();
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const mine = trpc.sessions.mine.useQuery({ semester });
  const courses = trpc.courses.mine.useQuery();
  const periods = trpc.settings.periods.useQuery();
  const isStudent = user?.role === "student";
  const list = (mine.data || []).filter(s => s.status !== "cancelled");
  const hours = list.reduce(
    (sum, s) =>
      sum +
      Math.max(
        1,
        Math.round(
          (Number(s.endTime.slice(0, 2)) * 60 +
            Number(s.endTime.slice(3)) -
            Number(s.startTime.slice(0, 2)) * 60 -
            Number(s.startTime.slice(3))) /
            55
        )
      ),
    0
  );
  const semesterCourses = (courses.data || []).filter(
    c => c.semester === semester
  );
  const cohort =
    isStudent && user?.level
      ? `Level ${user.level} · ${user.program || "IT"}`
      : null;
  const nextClass = useMemo(() => {
    const today = todayName();
    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    return (
      sortSessions(list).find(
        s =>
          s.day === today &&
          Number(s.startTime.slice(0, 2)) * 60 + Number(s.startTime.slice(3)) >=
            minutesNow
      ) || null
    );
  }, [list]);
  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        title={`${greeting()}, ${user?.name?.split(" ")[0] || ""}`}
        description={
          isStudent
            ? `${cohort || "Cohort not set — contact the administrator"} · ${academicYear} Semester ${semester}`
            : `Your teaching for ${academicYear} Semester ${semester}`
        }
        actions={
          <Button variant="outline" onClick={() => setLocation("/timetable")}>
            <CalendarDays size={15} /> Open timetable
          </Button>
        }
      />
      {isStudent && !user?.level && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your level and programme are not set on your account, so your personal
          timetable cannot be filtered. Please contact the faculty
          administrator.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label={isStudent ? "Classes per week" : "Sessions per week"}
          value={list.length}
          icon={CalendarDays}
        />
        <StatCard
          label={isStudent ? "Contact hours" : "Teaching hours"}
          value={hours}
          hint="per week"
          icon={Clock3}
          tone="blue"
        />
        <StatCard
          label={isStudent ? "Courses this semester" : "Courses assigned"}
          value={semesterCourses.length}
          icon={BookOpen}
          tone="gold"
          onClick={() => setLocation("/courses")}
        />
        <StatCard
          label="Next class today"
          value={nextClass ? nextClass.startTime : "—"}
          hint={
            nextClass
              ? `${nextClass.subjectCode} · ${nextClass.room?.code || "TBA"}`
              : "Nothing else today"
          }
          icon={isStudent ? GraduationCap : Users}
          tone="green"
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel
          title="This week"
          description={
            isStudent ? "Your cohort's weekly timetable" : "Sessions you teach"
          }
          bodyClassName="p-3"
        >
          {mine.isLoading ? (
            <Loading />
          ) : list.length ? (
            <WeeklyGrid
              sessions={list}
              periods={periods.data?.periods}
              onSelect={setSelected}
              showCohort={!isStudent}
              compact
            />
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No sessions yet"
              description="The timetable for this semester has not been published yet, or no sessions are assigned to you."
            />
          )}
        </Panel>
        <div className="space-y-6">
          <Panel title="Today">
            <TodayList
              sessions={list}
              onSelect={setSelected}
              emptyText="No classes today."
            />
          </Panel>
          <NoticesMini />
        </div>
      </div>
      <SessionDialog session={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  return user?.role === "admin" ? <AdminDashboard /> : <PersonalDashboard />;
}
