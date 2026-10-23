import { useState } from "react";
import { useSearch, useLocation } from "wouter";
import { toast } from "sonner";
import { BookOpen, Building2, GraduationCap, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { friendlyError } from "@/lib/uov";
import { Field, PageHeader, Panel } from "@/components/app/common";
import CsvImporter, { type ImportReport } from "@/components/app/CsvImporter";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "courses", label: "Courses", icon: BookOpen, step: 1 },
  { key: "lecturers", label: "Lecturers", icon: GraduationCap, step: 2 },
  { key: "rooms", label: "Lecture halls & labs", icon: Building2, step: 3 },
  { key: "students", label: "Student accounts", icon: Users, step: 4 },
] as const;
type Tab = (typeof tabs)[number]["key"];

export default function ImportPage() {
  const params = new URLSearchParams(useSearch());
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "courses");
  const utils = trpc.useUtils();
  const [reports, setReports] = useState<Partial<Record<Tab, ImportReport>>>(
    {}
  );
  const onError = (e: unknown) =>
    toast.error(friendlyError(e), { duration: 9000 });
  const saveReport = (key: Tab) => (report: ImportReport) => {
    setReports(r => ({ ...r, [key]: report }));
    toast.success(
      `Import finished: ${report.created ?? 0} created, ${report.updated ?? 0} updated`
    );
    void utils.invalidate();
  };
  const courses = trpc.courses.bulkImport.useMutation({
    onSuccess: saveReport("courses"),
    onError,
  });
  const lecturers = trpc.staff.bulkImport.useMutation({
    onSuccess: saveReport("lecturers"),
    onError,
  });
  const rooms = trpc.rooms.bulkImport.useMutation({
    onSuccess: saveReport("rooms"),
    onError,
  });
  const students = trpc.users.bulkStudents.useMutation({
    onSuccess: saveReport("students"),
    onError,
  });
  const academic = trpc.settings.academic.useQuery();

  const [useHandbook, setUseHandbook] = useState(true);
  const [autoAssign, setAutoAssign] = useState(true);
  const [createAccounts, setCreateAccounts] = useState(true);
  const [defaultLevel, setDefaultLevel] = useState<number | null>(null);
  const [defaultProgram, setDefaultProgram] = useState<"IT" | "AMC" | null>(
    null
  );
  const [updateExisting, setUpdateExisting] = useState(true);

  return (
    <>
      <PageHeader
        eyebrow="Bulk details import"
        title="Import faculty data from CSV"
        description="Upload the course list, lecturer teaching profiles, rooms and student lists. Every file is previewed first; rows with problems are skipped and reported instead of stopping the whole import. Re-importing a file updates existing records."
      />
      <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setLocation(`/import?tab=${t.key}`, { replace: true });
            }}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition",
              tab === t.key
                ? "border-primary bg-white shadow-sm ring-2 ring-primary/10"
                : "border-border bg-white/60 hover:bg-white"
            )}
          >
            <span
              className={cn(
                "grid size-9 place-items-center rounded-lg",
                tab === t.key
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <t.icon size={17} />
            </span>
            <span>
              <span className="block text-[11px] font-semibold text-muted-foreground uppercase">
                Step {t.step}
              </span>
              <span className="block text-sm font-bold">{t.label}</span>
            </span>
          </button>
        ))}
      </div>
      <Panel>
        {tab === "courses" && (
          <CsvImporter
            title="Course list (course declaring)"
            description="One row per course. Level, semester, credits and programme are read from the columns or worked out from the code (IT1134 → level 1, semester 1, 4 credits). Codes starting IT/EL are IT, AMA/PMA/STA/CSC/CSH are AMC, ACU courses are shared by both. EL courses are treated as electives."
            templateName="course-bulk-template.csv"
            templateHeader="subjectCode,subjectName,totalCredit,batch,semester,weeklyHours,theoryHours,practicalHours,program,category,lecturers"
            templateSample={
              "IT1113,Fundamentals of Information Technology,3,1st year,Semester 1,4,2,2,IT,core,DPS-001;DPS-012\nACU1113,English Language I,3,1st year,Semester 1,3,3,0,COMMON,core,\n"
            }
            requiredColumns={["subjectCode", "subjectName"]}
            pending={courses.isPending}
            report={reports.courses}
            onImport={rows =>
              courses.mutate({
                rows,
                useHandbook,
                autoAssignLecturers: autoAssign,
              })
            }
            extraSummary={r => (
              <>
                {r.enriched} courses received handbook details ·{" "}
                {r.lecturerLinks} lecturer assignments created
                {r.merged?.length
                  ? ` · ${r.merged.join(", ")} marked as common (IT + AMC)`
                  : ""}
              </>
            )}
            options={
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useHandbook}
                    onChange={e => setUseHandbook(e.target.checked)}
                  />{" "}
                  Fill objective, learning outcomes, contents & readings from
                  the faculty handbook
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoAssign}
                    onChange={e => setAutoAssign(e.target.checked)}
                  />{" "}
                  Assign lecturers from their teaching profiles
                </label>
              </div>
            }
          />
        )}
        {tab === "lecturers" && (
          <CsvImporter
            title="Lecturer teaching profiles"
            description="Columns 1.1 … 4.2 list the course codes each lecturer teaches in Level.Semester (several codes separated by commas). Lecturers whose title mentions “study leave” are marked on leave and not scheduled. Each lecturer gets a login account using their @vau.ac.lk email."
            templateName="lecturer-teaching-profile-template.csv"
            templateHeader="staffCode,name,email,phone,qualification,roleTitle,department,1.1,1.2,2.1,2.2,3.1,3.2,4.1,4.2"
            templateSample={
              'DPS-001,Mr. S. Kuhanesan,kuhan9@vau.ac.lk,,,Senior Lecturer Gr.I,Physical Science,"IT1113,ACU1113",IT1252,,,,CSC3213,IT4113,\n'
            }
            requiredColumns={["name", "email"]}
            pending={lecturers.isPending}
            report={reports.lecturers}
            onImport={rows =>
              lecturers.mutate({ rows, createAccounts, mapCourses: true })
            }
            extraSummary={r => (
              <>
                {r.accounts} login accounts created · {r.mappings} course
                assignments linked
              </>
            )}
            options={
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createAccounts}
                  onChange={e => setCreateAccounts(e.target.checked)}
                />{" "}
                Create lecturer login accounts (first sign-in with an empty
                password)
              </label>
            }
          />
        )}
        {tab === "rooms" && (
          <CsvImporter
            title="Lecture halls and laboratories"
            description="Room type decides what can be scheduled: types containing “Lab” receive practical sessions, all others receive lectures. Capacity is checked against the expected number of students."
            templateName="places-template.csv"
            templateHeader="code,name,type,capacity,department,building,floor,equipment,accessibility,status,availabilityNotes"
            templateSample={
              'LH-01,Lecture Hall 1,Lecture Hall,120,Faculty of Applied Science,1,1,"Projector;Audio;Whiteboard",Ramp access,available,\nCL-01,Computer Lab 1,Lab,60,Faculty of Applied Science,1,Ground Floor,"Projector;Computers",Ramp access,available,\n'
            }
            requiredColumns={["code", "type", "capacity"]}
            pending={rooms.isPending}
            report={reports.rooms}
            onImport={rows => rooms.mutate({ rows })}
          />
        )}
        {tab === "students" && (
          <CsvImporter
            title="Bulk student accounts"
            description={
              <>
                Only students with an account can sign in. The programme (IT /
                AMC) and current level are worked out from the registration
                number (e.g. 2022/ICT/114) and the current academic year (
                {academic.data?.academicYear || "—"}), or taken from optional{" "}
                <code>program</code> and <code>level</code> columns. Students
                sign in the first time with their email and an empty password.
              </>
            }
            templateName="student-accounts-template.csv"
            templateHeader="studentId,name,registrationNo,email,yearOfStudy,department,program,level"
            templateSample={
              "s001,A. Student,2022/ict/114,2022ict114@stu.vau.ac.lk,2022/2023,ict,IT,4\n"
            }
            requiredColumns={["name", "email"]}
            pending={students.isPending}
            report={reports.students}
            onImport={rows =>
              students.mutate({
                rows,
                defaultLevel,
                defaultProgram,
                updateExisting,
              })
            }
            options={
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Override level for this file"
                  hint="Leave automatic unless the file is a single level"
                >
                  <select
                    className="field"
                    value={defaultLevel ?? ""}
                    onChange={e =>
                      setDefaultLevel(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                  >
                    <option value="">Automatic</option>
                    {[1, 2, 3, 4].map(l => (
                      <option key={l} value={l}>
                        Level {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Programme when not detectable">
                  <select
                    className="field"
                    value={defaultProgram ?? ""}
                    onChange={e =>
                      setDefaultProgram((e.target.value || null) as any)
                    }
                  >
                    <option value="">Leave blank</option>
                    <option value="IT">IT</option>
                    <option value="AMC">AMC</option>
                  </select>
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={e => setUpdateExisting(e.target.checked)}
                  />{" "}
                  Update existing accounts
                </label>
              </div>
            }
          />
        )}
      </Panel>
    </>
  );
}
