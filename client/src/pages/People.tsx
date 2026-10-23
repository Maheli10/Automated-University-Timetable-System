import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  FileUp,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
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
  COHORTS,
  DAYS,
  DEFAULT_PERIODS,
  downloadCsv,
  friendlyError,
  type RoomRow,
  type StaffRow,
} from "@/lib/uov";
import {
  ConfirmButton,
  EmptyState,
  Field,
  Loading,
  PageHeader,
  Pill,
  SearchBox,
  Segmented,
  StatCard,
  Table,
  td,
  th,
} from "@/components/app/common";
import { cn } from "@/lib/utils";

const CELLS = ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2"];
const parseCells = (expertise?: string | null) => {
  const map: Record<string, string> = Object.fromEntries(
    CELLS.map(c => [c, ""])
  );
  for (const part of (expertise || "").split(";")) {
    const [k, v] = part.split(":").map(s => s?.trim());
    if (k && CELLS.includes(k)) map[k] = v || "";
  }
  return map;
};

// ---------------------------------------------------------------------------
// Lecturers
// ---------------------------------------------------------------------------
function LecturerDialog({
  open,
  person,
  onClose,
}: {
  open: boolean;
  person: StaffRow | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (!open) return;
    setF(
      person
        ? {
            ...person,
            email: person.email || "",
            telephone: person.telephone || "",
            qualification: person.qualification || "",
            availability: person.availability || "",
            cells: parseCells(person.expertise),
            maxDaily: Math.round(person.maxDailyMinutes / 60),
            maxWeekly: Math.round(person.maxWeeklyMinutes / 60),
          }
        : {
            staffCode: "",
            name: "",
            role: "Lecturer",
            department: "Physical Science",
            email: "",
            telephone: "",
            qualification: "",
            availability: "",
            status: "active",
            cells: parseCells(""),
            maxDaily: 8,
            maxWeekly: 40,
          }
    );
  }, [open, person?.id]);
  const done = async (m: string) => {
    toast.success(m);
    await Promise.all([
      utils.staff.list.invalidate(),
      utils.courses.list.invalidate(),
    ]);
    onClose();
  };
  const create = trpc.staff.create.useMutation({
    onSuccess: () => done("Lecturer added"),
    onError: e => toast.error(friendlyError(e)),
  });
  const update = trpc.staff.update.useMutation({
    onSuccess: () => done("Lecturer updated"),
    onError: e => toast.error(friendlyError(e)),
  });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const save = () => {
    const payload = {
      staffCode: f.staffCode.trim(),
      name: f.name.trim(),
      role: f.role || "Lecturer",
      department: f.department || "Physical Science",
      email: f.email.trim().toLowerCase(),
      telephone: f.telephone,
      qualification: f.qualification,
      availability: f.availability,
      status: f.status,
      expertise: CELLS.map(
        c => `${c}: ${(f.cells[c] || "").toUpperCase()}`
      ).join("; "),
      maxDailyMinutes: Math.max(60, Number(f.maxDaily) * 60),
      maxWeeklyMinutes: Math.max(60, Number(f.maxWeekly) * 60),
    };
    if (person) update.mutate({ ...payload, id: person.id });
    else create.mutate(payload);
  };
  if (!open || !f.cells) return null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{person ? "Edit lecturer" : "Add lecturer"}</DialogTitle>
          <DialogDescription>
            Teaching-profile codes are used to assign lecturers to courses
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Staff code">
            <input
              className="field"
              value={f.staffCode}
              onChange={e => set("staffCode", e.target.value)}
            />
          </Field>
          <Field label="Full name" className="sm:col-span-2">
            <input
              className="field"
              value={f.name}
              onChange={e => set("name", e.target.value)}
            />
          </Field>
          <Field label="UOV email">
            <input
              className="field"
              value={f.email}
              onChange={e => set("email", e.target.value)}
              placeholder="name@vau.ac.lk"
            />
          </Field>
          <Field label="Phone">
            <input
              className="field"
              value={f.telephone}
              onChange={e => set("telephone", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <select
              className="field"
              value={f.status}
              onChange={e => set("status", e.target.value)}
            >
              <option value="active">Active</option>
              <option value="on-leave">On leave (not scheduled)</option>
            </select>
          </Field>
          <Field label="Designation">
            <input
              className="field"
              value={f.role}
              onChange={e => set("role", e.target.value)}
            />
          </Field>
          <Field label="Department">
            <input
              className="field"
              value={f.department}
              onChange={e => set("department", e.target.value)}
            />
          </Field>
          <Field label="Qualification">
            <input
              className="field"
              value={f.qualification}
              onChange={e => set("qualification", e.target.value)}
            />
          </Field>
          <Field label="Max hours / day">
            <input
              className="field"
              type="number"
              min={1}
              max={12}
              value={f.maxDaily}
              onChange={e => set("maxDaily", e.target.value)}
            />
          </Field>
          <Field label="Max hours / week">
            <input
              className="field"
              type="number"
              min={1}
              max={60}
              value={f.maxWeekly}
              onChange={e => set("maxWeekly", e.target.value)}
            />
          </Field>
          <Field
            label="Unavailable"
            hint="e.g. Wednesday 13:30-16:35; Friday 08:30-10:20"
          >
            <input
              className="field"
              value={f.availability}
              onChange={e => set("availability", e.target.value)}
            />
          </Field>
        </div>
        <div>
          <p className="label">
            Teaching profile (course codes by Level.Semester)
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CELLS.map(c => (
              <label key={c} className="block">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  L{c.replace(".", " · S")}
                </span>
                <input
                  className="field h-9"
                  value={f.cells[c]}
                  onChange={e =>
                    setF((x: any) => ({
                      ...x,
                      cells: { ...x.cells, [c]: e.target.value },
                    }))
                  }
                  placeholder="IT1113, ACU1113"
                />
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={
              !f.staffCode || !f.name || create.isPending || update.isPending
            }
          >
            {person ? "Save" : "Add lecturer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LecturersPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const staff = trpc.staff.list.useQuery();
  const courses = trpc.courses.list.useQuery();
  const { semester } = useSemester();
  const sessions = trpc.sessions.list.useQuery({ semester });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "on-leave">("all");
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);
  const remove = trpc.staff.delete.useMutation({
    onSuccess: () => {
      toast.success("Lecturer removed");
      utils.staff.list.invalidate();
    },
    onError: e => toast.error(friendlyError(e)),
  });
  const hours = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of sessions.data || [])
      if (s.status !== "cancelled")
        for (const id of s.staffIds)
          map.set(
            id,
            (map.get(id) || 0) +
              Math.max(
                1,
                Math.round((toMin(s.endTime) - toMin(s.startTime)) / 55)
              )
          );
    return map;
  }, [sessions.data]);
  const list = (staff.data || []).filter(
    p =>
      (status === "all" || p.status === status) &&
      `${p.name} ${p.staffCode} ${p.email} ${p.expertise}`
        .toLowerCase()
        .includes(q.toLowerCase())
  );
  const courseCount = (id: number) =>
    (courses.data || []).filter(c => c.lecturers.some(l => l.staffId === id))
      .length;
  return (
    <>
      <PageHeader
        eyebrow="Academic staff"
        title="Lecturers"
        description="Teaching staff, their availability limits and the courses they are assigned to."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "uov-lecturers.csv",
                  list.map(p => ({
                    staffCode: p.staffCode,
                    name: p.name,
                    email: p.email,
                    phone: p.telephone,
                    qualification: p.qualification,
                    roleTitle: p.role,
                    department: p.department,
                    ...parseCells(p.expertise),
                  }))
                )
              }
            >
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/import?tab=lecturers")}
            >
              <FileUp size={14} /> Bulk import
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> Add lecturer
            </Button>
          </>
        }
      />
      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-4">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: `All (${staff.data?.length || 0})` },
            { value: "active", label: "Active" },
            { value: "on-leave", label: "On leave" },
          ]}
        />
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Name, staff code, email or course code"
          className="min-w-[240px] flex-1"
        />
      </div>
      {staff.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState
          icon={Users}
          title="No lecturers"
          description="Import the lecturer teaching-profile CSV or add lecturers one by one."
          action={
            <Button onClick={() => setLocation("/import?tab=lecturers")}>
              Import lecturers
            </Button>
          }
        />
      ) : (
        <div className="panel overflow-hidden">
          <Table>
            <thead>
              <tr>
                {[
                  "Lecturer",
                  "Contact",
                  "Designation",
                  "Courses",
                  `S${semester} hours`,
                  "Limits",
                  "Status",
                  "",
                ].map(h => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className={td}>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.staffCode} · {p.department}
                    </p>
                  </td>
                  <td className={cn(td, "text-xs")}>
                    {p.email || "—"}
                    <br />
                    <span className="text-muted-foreground">{p.telephone}</span>
                  </td>
                  <td className={cn(td, "text-xs")}>{p.role}</td>
                  <td className={cn(td, "tabular")}>{courseCount(p.id)}</td>
                  <td className={cn(td, "font-semibold tabular")}>
                    {hours.get(p.id) || 0}
                  </td>
                  <td
                    className={cn(td, "text-xs text-muted-foreground tabular")}
                  >
                    {Math.round(p.maxDailyMinutes / 60)}h/day ·{" "}
                    {Math.round(p.maxWeeklyMinutes / 60)}h/wk
                  </td>
                  <td className={td}>
                    <Pill tone={p.status === "active" ? "green" : "red"}>
                      {p.status}
                    </Pill>
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-right")}>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Timetable"
                      onClick={() => setLocation(`/timetable?staff=${p.id}`)}
                    >
                      <CalendarDays size={14} />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Edit"
                      onClick={() => setEditing(p)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <ConfirmButton
                      size="icon-sm"
                      variant="ghost"
                      title={`Remove ${p.name}?`}
                      description="Their course assignments and session assignments are removed too."
                      confirmLabel="Remove"
                      onConfirm={() => remove.mutate({ id: p.id })}
                    >
                      <Trash2 size={14} />
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      <LecturerDialog
        open={creating || Boolean(editing)}
        person={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
function RoomDialog({
  open,
  room,
  onClose,
}: {
  open: boolean;
  room: RoomRow | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (open)
      setF(
        room
          ? {
              ...room,
              department: room.department || "",
              building: room.building || "",
              floor: room.floor || "",
              equipment: room.equipment || "",
              accessibility: room.accessibility || "",
              availabilityNotes: room.availabilityNotes || "",
            }
          : {
              code: "",
              name: "",
              type: "Lecture Hall",
              capacity: 60,
              department: "Faculty of Applied Science",
              building: "",
              floor: "",
              equipment: "Projector; Whiteboard",
              accessibility: "",
              status: "available",
              availabilityNotes: "",
            }
      );
  }, [open, room?.id]);
  const done = async (m: string) => {
    toast.success(m);
    await utils.rooms.list.invalidate();
    onClose();
  };
  const create = trpc.rooms.create.useMutation({
    onSuccess: () => done("Room added"),
    onError: e => toast.error(friendlyError(e)),
  });
  const update = trpc.rooms.update.useMutation({
    onSuccess: () => done("Room updated"),
    onError: e => toast.error(friendlyError(e)),
  });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  if (!open || f.code === undefined) return null;
  const save = () => {
    const { id, updatedAt, ...rest } = f;
    const payload = { ...rest, capacity: Number(f.capacity) };
    if (room) update.mutate({ ...payload, id: room.id });
    else create.mutate(payload);
  };
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {room ? `Edit ${room.code}` : "Add lecture hall or lab"}
          </DialogTitle>
          <DialogDescription>
            Rooms whose type contains “Lab” are used for practical sessions; the
            rest for lectures.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code">
            <input
              className="field"
              value={f.code}
              onChange={e => set("code", e.target.value)}
            />
          </Field>
          <Field label="Name" className="sm:col-span-2">
            <input
              className="field"
              value={f.name}
              onChange={e => set("name", e.target.value)}
            />
          </Field>
          <Field label="Type">
            <select
              className="field"
              value={f.type}
              onChange={e => set("type", e.target.value)}
            >
              {[
                "Lecture Hall",
                "Lab",
                "Computer Lab",
                "Seminar Room",
                "Auditorium",
              ].map(t => (
                <option key={t}>{t}</option>
              ))}
              {![
                "Lecture Hall",
                "Lab",
                "Computer Lab",
                "Seminar Room",
                "Auditorium",
              ].includes(f.type) && <option>{f.type}</option>}
            </select>
          </Field>
          <Field label="Capacity">
            <input
              className="field"
              type="number"
              min={1}
              value={f.capacity}
              onChange={e => set("capacity", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <select
              className="field"
              value={f.status}
              onChange={e => set("status", e.target.value)}
            >
              <option value="available">Available</option>
              <option value="maintenance">Under maintenance</option>
            </select>
          </Field>
          <Field label="Building">
            <input
              className="field"
              value={f.building}
              onChange={e => set("building", e.target.value)}
            />
          </Field>
          <Field label="Floor">
            <input
              className="field"
              value={f.floor}
              onChange={e => set("floor", e.target.value)}
            />
          </Field>
          <Field label="Accessibility">
            <input
              className="field"
              value={f.accessibility}
              onChange={e => set("accessibility", e.target.value)}
            />
          </Field>
          <Field label="Equipment" className="sm:col-span-3">
            <input
              className="field"
              value={f.equipment}
              onChange={e => set("equipment", e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!f.code || !f.name || !f.capacity}>
            {room ? "Save" : "Add room"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RoomsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const rooms = trpc.rooms.list.useQuery();
  const { semester } = useSemester();
  const [editing, setEditing] = useState<RoomRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [finder, setFinder] = useState({
    day: DAYS[0] as string,
    slot: `${DEFAULT_PERIODS[0].start}-${DEFAULT_PERIODS[0].end}`,
    capacity: 0,
    kind: "any" as "any" | "hall" | "lab",
  });
  const [start, end] = finder.slot.split("-");
  const free = trpc.rooms.available.useQuery({
    day: finder.day,
    startTime: start,
    endTime: end,
    capacity: finder.capacity,
    kind: finder.kind,
    semester,
  });
  const remove = trpc.rooms.delete.useMutation({
    onSuccess: () => {
      toast.success("Room removed");
      utils.rooms.list.invalidate();
    },
    onError: e => toast.error(friendlyError(e)),
  });
  const list = rooms.data || [];
  const labs = list.filter(r => /lab|computer/i.test(r.type));
  return (
    <>
      <PageHeader
        eyebrow="Lecture hall assignment"
        title="Lecture halls & laboratories"
        description="Teaching spaces used by the generator, and a finder for free rooms at any period."
        actions={
          isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/import?tab=rooms")}
              >
                <FileUp size={14} /> Bulk import
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus size={14} /> Add room
              </Button>
            </>
          )
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Lecture halls"
          value={list.length - labs.length}
          hint={`${list.filter(r => !/lab|computer/i.test(r.type)).reduce((s, r) => s + r.capacity, 0)} seats`}
          icon={Building2}
        />
        <StatCard
          label="Laboratories"
          value={labs.length}
          hint={`${labs.reduce((s, r) => s + r.capacity, 0)} seats`}
          icon={Building2}
          tone="gold"
        />
        <StatCard
          label="Under maintenance"
          value={list.filter(r => r.status === "maintenance").length}
          icon={Building2}
          tone="red"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {rooms.isLoading ? (
          <Loading />
        ) : !list.length ? (
          <EmptyState
            icon={Building2}
            title="No rooms yet"
            description="Import the places CSV or add rooms."
          />
        ) : (
          <div className="panel h-fit min-w-0 overflow-hidden">
            <Table>
              <thead>
                <tr>
                  {["Room", "Type", "Capacity", "Equipment", "Status", ""].map(
                    h => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className={td}>
                      <b>{r.code}</b>{" "}
                      <span className="text-muted-foreground">{r.name}</span>
                      <p className="text-[11px] text-muted-foreground">
                        {[
                          r.building && `Building ${r.building}`,
                          r.floor && `Floor ${r.floor}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    <td className={td}>
                      <Pill
                        tone={/lab|computer/i.test(r.type) ? "gold" : "blue"}
                      >
                        {r.type}
                      </Pill>
                    </td>
                    <td className={cn(td, "tabular")}>{r.capacity}</td>
                    <td
                      className={cn(
                        td,
                        "max-w-[220px] text-xs text-muted-foreground"
                      )}
                    >
                      {r.equipment}
                    </td>
                    <td className={td}>
                      <Pill tone={r.status === "available" ? "green" : "red"}>
                        {r.status}
                      </Pill>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right")}>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Timetable"
                        onClick={() => setLocation(`/timetable?room=${r.id}`)}
                      >
                        <CalendarDays size={14} />
                      </Button>
                      {isAdmin && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setEditing(r)}
                        >
                          <Pencil size={14} />
                        </Button>
                      )}
                      {isAdmin && (
                        <ConfirmButton
                          size="icon-sm"
                          variant="ghost"
                          title={`Remove ${r.code}?`}
                          description="Sessions booked in this room will show “Room TBA”."
                          confirmLabel="Remove"
                          onConfirm={() => remove.mutate({ id: r.id })}
                        >
                          <Trash2 size={14} />
                        </ConfirmButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        <div className="panel h-fit p-5">
          <p className="flex items-center gap-2 text-[15px] font-bold">
            <Search size={16} className="text-primary" /> Find a free room
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Semester {semester} weekly timetable
          </p>
          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Day">
                <select
                  className="field"
                  value={finder.day}
                  onChange={e =>
                    setFinder(f => ({ ...f, day: e.target.value }))
                  }
                >
                  {DAYS.map(d => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </Field>
              <Field label="Period">
                <select
                  className="field"
                  value={finder.slot}
                  onChange={e =>
                    setFinder(f => ({ ...f, slot: e.target.value }))
                  }
                >
                  {[
                    ...DEFAULT_PERIODS,
                    { start: "08:30", end: "10:20" },
                    { start: "10:40", end: "12:30" },
                    { start: "13:30", end: "15:20" },
                  ].map(p => (
                    <option
                      key={`${p.start}-${p.end}`}
                      value={`${p.start}-${p.end}`}
                    >
                      {p.start}–{p.end}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Min. seats">
                <input
                  className="field"
                  type="number"
                  min={0}
                  value={finder.capacity}
                  onChange={e =>
                    setFinder(f => ({ ...f, capacity: Number(e.target.value) }))
                  }
                />
              </Field>
              <Field label="Kind">
                <select
                  className="field"
                  value={finder.kind}
                  onChange={e =>
                    setFinder(f => ({ ...f, kind: e.target.value as any }))
                  }
                >
                  <option value="any">Any</option>
                  <option value="hall">Lecture hall</option>
                  <option value="lab">Laboratory</option>
                </select>
              </Field>
            </div>
            <ul className="space-y-1.5">
              {(free.data || []).map(r => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span>
                    <b>{r.code}</b>{" "}
                    <span className="text-muted-foreground">
                      {r.capacity} seats
                    </span>
                  </span>
                  {r.free ? (
                    <Pill tone="green">Free</Pill>
                  ) : (
                    <Pill tone="red">{r.busyWith}</Pill>
                  )}
                </li>
              ))}
              {free.data && !free.data.length && (
                <p className="text-sm text-muted-foreground">
                  No room matches.
                </p>
              )}
            </ul>
          </div>
        </div>
      </div>
      <RoomDialog
        open={creating || Boolean(editing)}
        room={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
function StudentDialog({
  open,
  student,
  onClose,
}: {
  open: boolean;
  student: any | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (open)
      setF(
        student
          ? {
              name: student.name || "",
              email: student.email || "",
              registrationNo: student.registrationNo || "",
              studentId: student.studentId || "",
              academicYear: student.academicYear || "",
              program: student.program || "IT",
              level: student.level || 1,
              phone: student.phone || "",
            }
          : {
              name: "",
              email: "",
              registrationNo: "",
              studentId: "",
              academicYear: "",
              program: "IT",
              level: 1,
              phone: "",
            }
      );
  }, [open, student?.id]);
  const done = async (m: string) => {
    toast.success(m);
    await utils.users.list.invalidate();
    onClose();
  };
  const create = trpc.users.create.useMutation({
    onSuccess: () => done("Student account created"),
    onError: e => toast.error(friendlyError(e)),
  });
  const update = trpc.users.update.useMutation({
    onSuccess: () => done("Student updated"),
    onError: e => toast.error(friendlyError(e)),
  });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  if (!open || f.email === undefined) return null;
  const save = () => {
    const payload = {
      ...f,
      role: "student" as const,
      level: Number(f.level),
      roleTitle: "Student",
      email: f.email.trim().toLowerCase(),
    };
    if (student) update.mutate({ ...payload, id: student.id });
    else create.mutate(payload);
  };
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {student ? "Edit student" : "Create student account"}
          </DialogTitle>
          <DialogDescription>
            The student signs in with this email and an empty password the first
            time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <input
              className="field"
              value={f.name}
              onChange={e => set("name", e.target.value)}
            />
          </Field>
          <Field label="University email">
            <input
              className="field"
              value={f.email}
              onChange={e => set("email", e.target.value)}
              placeholder="2022ict114@stu.vau.ac.lk"
            />
          </Field>
          <Field label="Registration no.">
            <input
              className="field"
              value={f.registrationNo}
              onChange={e => set("registrationNo", e.target.value)}
              placeholder="2022/ICT/114"
            />
          </Field>
          <Field label="Student ID">
            <input
              className="field"
              value={f.studentId}
              onChange={e => set("studentId", e.target.value)}
            />
          </Field>
          <Field label="Programme">
            <select
              className="field"
              value={f.program}
              onChange={e => set("program", e.target.value)}
            >
              <option value="IT">IT</option>
              <option value="AMC">AMC</option>
            </select>
          </Field>
          <Field label="Current level">
            <select
              className="field"
              value={f.level}
              onChange={e => set("level", e.target.value)}
            >
              {[1, 2, 3, 4].map(l => (
                <option key={l} value={l}>
                  Level {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Batch (academic year)">
            <input
              className="field"
              value={f.academicYear}
              onChange={e => set("academicYear", e.target.value)}
              placeholder="2022/2023"
            />
          </Field>
          <Field label="Phone">
            <input
              className="field"
              value={f.phone}
              onChange={e => set("phone", e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!f.name || !f.email}>
            {student ? "Save" : "Create account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StudentsPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const users = trpc.users.list.useQuery();
  const [cohort, setCohort] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const onError = (e: unknown) => toast.error(friendlyError(e));
  const remove = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success("Account deleted");
      utils.users.list.invalidate();
    },
    onError,
  });
  const removeAll = trpc.users.deleteAll.useMutation({
    onSuccess: () => {
      toast.success("All student accounts deleted");
      utils.users.list.invalidate();
    },
    onError,
  });
  const reset = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      toast.success(
        "Password reset — the student can sign in with an empty password and create a new one"
      );
      utils.users.list.invalidate();
    },
    onError,
  });
  const students = (users.data || []).filter(u => u.role === "student");
  const list = students
    .filter(
      u =>
        cohort === "all" ||
        (cohort === "none"
          ? !u.level || !u.program
          : `${u.program}-L${u.level}` === cohort)
    )
    .filter(u =>
      `${u.name} ${u.email} ${u.registrationNo} ${u.studentId}`
        .toLowerCase()
        .includes(q.toLowerCase())
    );
  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Student accounts"
        description="Only students with an account can sign in. Each student sees the timetable and courses of their own level and programme."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "uov-students.csv",
                  list.map(u => ({
                    studentId: u.studentId,
                    name: u.name,
                    registrationNo: u.registrationNo,
                    email: u.email,
                    yearOfStudy: u.academicYear,
                    program: u.program,
                    level: u.level,
                    activated: u.hasPassword ? "yes" : "no",
                  }))
                )
              }
            >
              Export CSV
            </Button>
            <ConfirmButton
              title="Delete ALL student accounts?"
              description="Every student account is removed. Students will no longer be able to sign in."
              confirmLabel="Delete all"
              onConfirm={() => removeAll.mutate({ role: "student" })}
              className="text-destructive"
              disabled={!students.length}
            >
              Delete all
            </ConfirmButton>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/import?tab=students")}
            >
              <FileUp size={14} /> Bulk create
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> Add student
            </Button>
          </>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {COHORTS.map(c => {
          const n = students.filter(
            u => `${u.program}-L${u.level}` === c.key
          ).length;
          return (
            <button
              key={c.key}
              onClick={() => setCohort(cohort === c.key ? "all" : c.key)}
              className={cn(
                "panel p-3 text-left",
                cohort === c.key && "border-primary ring-2 ring-primary/10"
              )}
            >
              <p className="text-[11px] font-semibold text-muted-foreground">
                {c.label}
              </p>
              <p className="text-xl font-bold tabular">{n}</p>
            </button>
          );
        })}
      </div>
      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-4">
        <select
          className="field w-52"
          value={cohort}
          onChange={e => setCohort(e.target.value)}
        >
          <option value="all">All students ({students.length})</option>
          {COHORTS.map(c => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
          <option value="none">Level / programme missing</option>
        </select>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Name, email, registration no."
          className="min-w-[240px] flex-1"
        />
      </div>
      {users.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState
          icon={Users}
          title="No student accounts"
          description="Create accounts in bulk from the student list CSV."
          action={
            <Button onClick={() => setLocation("/import?tab=students")}>
              Bulk create accounts
            </Button>
          }
        />
      ) : (
        <div className="panel overflow-hidden">
          <Table>
            <thead>
              <tr>
                {[
                  "Student",
                  "Registration",
                  "Cohort",
                  "Batch",
                  "Account",
                  "Last sign-in",
                  "",
                ].map(h => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 500).map(u => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className={td}>
                    <p className="font-semibold">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className={cn(td, "text-xs")}>
                    {u.registrationNo || "—"}
                    <br />
                    <span className="text-muted-foreground">{u.studentId}</span>
                  </td>
                  <td className={td}>
                    {u.level ? (
                      <Pill tone={u.program === "AMC" ? "blue" : "plum"}>
                        L{u.level} · {u.program || "?"}
                      </Pill>
                    ) : (
                      <Pill tone="gold">Not set</Pill>
                    )}
                  </td>
                  <td className={cn(td, "text-xs")}>{u.academicYear || "—"}</td>
                  <td className={td}>
                    {u.hasPassword ? (
                      <Pill tone="green">Active</Pill>
                    ) : (
                      <Pill>Awaiting first sign-in</Pill>
                    )}
                  </td>
                  <td className={cn(td, "text-xs text-muted-foreground")}>
                    {u.hasPassword
                      ? new Date(u.lastSignedIn as any).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-right")}>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditing(u)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <ConfirmButton
                      size="icon-sm"
                      variant="ghost"
                      destructive={false}
                      title="Reset this student's password?"
                      description="The student will sign in with an empty password and create a new one."
                      confirmLabel="Reset"
                      onConfirm={() => reset.mutate({ id: u.id })}
                    >
                      <KeyRound size={14} />
                    </ConfirmButton>
                    <ConfirmButton
                      size="icon-sm"
                      variant="ghost"
                      title={`Delete ${u.name}?`}
                      confirmLabel="Delete"
                      onConfirm={() => remove.mutate({ id: u.id })}
                    >
                      <Trash2 size={14} />
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {list.length > 500 && (
            <p className="px-4 py-2 text-xs text-muted-foreground">
              Showing 500 of {list.length}. Use search to narrow down.
            </p>
          )}
        </div>
      )}
      <StudentDialog
        open={creating || Boolean(editing)}
        student={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
