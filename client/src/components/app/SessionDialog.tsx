import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  BookOpen,
  Building2,
  CalendarClock,
  Copy,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  UserRoundCog,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  courseColor,
  DAYS,
  DEFAULT_PERIODS,
  durationLabel,
  friendlyError,
  PRACTICAL_SLOTS,
  type SessionRow,
} from "@/lib/uov";
import { ConfirmButton, Field, KeyValue, Notice, Pill } from "./common";
import { cn } from "@/lib/utils";

type Mode =
  | null
  | "reschedule"
  | "room"
  | "staff"
  | "cancel"
  | "swap"
  | "duplicate";

export function TimeSlotPicker({
  classType,
  day,
  start,
  end,
  onChange,
}: {
  classType: string;
  day: string;
  start: string;
  end: string;
  onChange: (v: { day: string; start: string; end: string }) => void;
}) {
  const slots =
    classType === "Practical"
      ? PRACTICAL_SLOTS
      : [...DEFAULT_PERIODS, ...PRACTICAL_SLOTS.map(s => ({ ...s }))];
  const key = `${start}-${end}`;
  const known = slots.some(s => `${s.start}-${s.end}` === key);
  const [custom, setCustom] = useState(!known);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Day">
        <select
          className="field"
          value={day}
          onChange={e => onChange({ day: e.target.value, start, end })}
        >
          {DAYS.map(d => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </Field>
      {!custom ? (
        <Field label="Time slot" className="sm:col-span-2">
          <select
            className="field"
            value={known ? key : ""}
            onChange={e => {
              if (e.target.value === "custom") return setCustom(true);
              const [s, en] = e.target.value.split("-");
              onChange({ day, start: s, end: en });
            }}
          >
            {!known && <option value="">Choose a slot</option>}
            {slots.map(s => (
              <option key={`${s.start}-${s.end}`} value={`${s.start}-${s.end}`}>
                {s.start} – {s.end} ({durationLabel(s.start, s.end)})
              </option>
            ))}
            <option value="custom">Custom time…</option>
          </select>
        </Field>
      ) : (
        <>
          <Field label="Start">
            <input
              className="field"
              type="time"
              value={start}
              onChange={e => onChange({ day, start: e.target.value, end })}
            />
          </Field>
          <Field label="End">
            <input
              className="field"
              type="time"
              value={end}
              onChange={e => onChange({ day, start, end: e.target.value })}
            />
          </Field>
        </>
      )}
    </div>
  );
}

export default function SessionDialog({
  session,
  onClose,
  onEdit,
}: {
  session: SessionRow | null;
  onClose: () => void;
  onEdit?: (session: SessionRow) => void;
}) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const me = trpc.sessions.myStaffProfile.useQuery(undefined, {
    enabled: user?.role === "lecturer",
  });
  const [mode, setMode] = useState<Mode>(null);
  const [slot, setSlot] = useState({
    day: "Monday",
    start: "08:30",
    end: "09:25",
  });
  const [roomId, setRoomId] = useState<number | null>(null);
  const [staffIds, setStaffIds] = useState<number[]>([]);
  const [cancelScope, setCancelScope] = useState<"one" | "all">("one");
  const [cancelDate, setCancelDate] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!session) return;
    setMode(null);
    setSlot({
      day: session.day,
      start: session.startTime,
      end: session.endTime,
    });
    setRoomId(session.roomId);
    setStaffIds(session.staffIds);
    setReason("");
    setCancelScope(session.scheduleType === "routine" ? "one" : "all");
    setCancelDate("");
  }, [session?.id]);

  const refresh = async () => {
    await Promise.all([
      utils.sessions.list.invalidate(),
      utils.sessions.mine.invalidate(),
      utils.analytics.overview.invalidate(),
      utils.swaps.list.invalidate(),
    ]);
  };
  const done = (message: string) => async () => {
    toast.success(message);
    await refresh();
    onClose();
  };
  const onError = (error: unknown) =>
    toast.error(friendlyError(error), { duration: 8000 });
  const reschedule = trpc.sessions.reschedule.useMutation({
    onSuccess: done("Session moved — lecturers and students were notified"),
    onError,
  });
  const assignRoom = trpc.sessions.assignRoom.useMutation({
    onSuccess: done("Lecture hall updated"),
    onError,
  });
  const assignStaff = trpc.sessions.assignStaff.useMutation({
    onSuccess: done("Lecturer assignment updated"),
    onError,
  });
  const duplicate = trpc.sessions.duplicate.useMutation({
    onSuccess: done("Session duplicated"),
    onError,
  });
  const cancel = trpc.sessions.cancel.useMutation({
    onSuccess: done("Session cancelled — the audience was notified"),
    onError,
  });
  const restore = trpc.sessions.restore.useMutation({
    onSuccess: done("Session restored"),
    onError,
  });
  const remove = trpc.sessions.delete.useMutation({
    onSuccess: done("Session deleted"),
    onError,
  });
  const swap = trpc.swaps.request.useMutation({
    onSuccess: done("Change request sent to the administrator"),
    onError,
  });

  const isAdmin = user?.role === "admin";
  const teaches = Boolean(
    session && me.data && session.staffIds.includes(me.data.id)
  );
  const canEdit = isAdmin || (user?.role === "lecturer" && teaches);
  const rooms = trpc.rooms.available.useQuery(
    {
      day: session?.day || "Monday",
      startTime: session?.startTime || "08:30",
      endTime: session?.endTime || "09:25",
      capacity: 0,
      kind: session?.classType === "Practical" ? "lab" : "hall",
      excludeSessionId: session?.id,
      semester:
        Number(String(session?.semester || "").match(/[12]/)?.[0]) || undefined,
    },
    { enabled: Boolean(session) && mode === "room" }
  );
  const staffList = trpc.staff.list.useQuery(undefined, {
    enabled: Boolean(session) && mode === "staff",
  });
  const color = session ? courseColor(session.subjectCode) : null;
  const busy = [
    reschedule,
    assignRoom,
    assignStaff,
    duplicate,
    cancel,
    restore,
    remove,
    swap,
  ].some(m => m.isPending);

  const actions = useMemo(() => {
    const list: { key: Mode; label: string; icon: any; show: boolean }[] = [
      {
        key: "reschedule",
        label: "Reschedule",
        icon: CalendarClock,
        show: canEdit,
      },
      { key: "room", label: "Change hall", icon: Building2, show: isAdmin },
      {
        key: "staff",
        label: "Change lecturer",
        icon: UserRoundCog,
        show: isAdmin,
      },
      { key: "duplicate", label: "Duplicate", icon: Copy, show: canEdit },
      {
        key: "swap",
        label: "Request change",
        icon: ArrowRightLeft,
        show: user?.role === "lecturer",
      },
      {
        key: "cancel",
        label: "Cancel",
        icon: XCircle,
        show: canEdit && session?.status !== "cancelled",
      },
    ];
    return list.filter(item => item.show);
  }, [canEdit, isAdmin, user?.role, session?.status]);

  if (!session) return null;
  return (
    <Dialog open={Boolean(session)} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-xs font-bold"
              style={{ backgroundColor: color!.bg, color: color!.text }}
            >
              {session.subjectCode}
            </span>
            <Pill tone={session.classType === "Practical" ? "gold" : "blue"}>
              {session.classType}
            </Pill>
            {session.status !== "scheduled" && (
              <Pill tone={session.status === "cancelled" ? "red" : "gold"}>
                {session.status}
              </Pill>
            )}
            {session.category === "elective" && (
              <Pill tone="green">Elective</Pill>
            )}
          </div>
          <DialogTitle className="mt-1 text-xl">
            {session.subjectName}
          </DialogTitle>
          <DialogDescription>
            {session.day} · {session.startTime}–{session.endTime} (
            {durationLabel(session.startTime, session.endTime)}) ·{" "}
            {session.semester || "Semester"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KeyValue label="Cohort" value={session.batch} />
          <KeyValue
            label="Lecture hall"
            value={
              session.room
                ? `${session.room.code} · ${session.room.name}`
                : "Not assigned"
            }
          />
          <KeyValue
            label="Lecturer"
            value={session.staff.map(p => p.name).join(", ") || "TBA"}
          />
          <KeyValue
            label="Expected students"
            value={session.participantCount}
          />
          <KeyValue
            label="Schedule"
            value={
              session.scheduleType === "routine"
                ? "Weekly (routine)"
                : `One-off ${session.sessionDate || ""}`
            }
          />
          <KeyValue
            label="Room capacity"
            value={session.room ? `${session.room.capacity} seats` : "—"}
          />
        </div>
        {session.notes && <Notice tone="slate">{session.notes}</Notice>}
        {session.courseId && (
          <Link
            href={`/courses/${session.courseId}`}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <BookOpen size={15} /> View course details & learning outcomes
          </Link>
        )}

        {(actions.length > 0 || isAdmin) && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {actions.map(action => (
              <Button
                key={action.key}
                size="sm"
                variant={mode === action.key ? "default" : "outline"}
                onClick={() => setMode(mode === action.key ? null : action.key)}
              >
                <action.icon size={14} /> {action.label}
              </Button>
            ))}
            {canEdit && onEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(session)}
              >
                <Pencil size={14} /> Edit all details
              </Button>
            )}
            {canEdit && session.status === "cancelled" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => restore.mutate({ id: session.id })}
              >
                <RotateCcw size={14} /> Restore
              </Button>
            )}
            {isAdmin && (
              <ConfirmButton
                title="Delete this session permanently?"
                description="The session is removed from the timetable. This cannot be undone."
                confirmLabel="Delete"
                onConfirm={() => remove.mutate({ id: session.id })}
                className="text-destructive"
              >
                <Trash2 size={14} /> Delete
              </ConfirmButton>
            )}
          </div>
        )}

        {mode && (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            {(mode === "reschedule" ||
              mode === "duplicate" ||
              mode === "swap") && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  {mode === "reschedule"
                    ? "Move this session"
                    : mode === "duplicate"
                      ? "Create a copy at"
                      : "Request a new time"}
                </p>
                <TimeSlotPicker
                  classType={session.classType}
                  day={slot.day}
                  start={slot.start}
                  end={slot.end}
                  onChange={v => setSlot(v)}
                />
                {mode === "swap" && (
                  <Field label="Reason">
                    <textarea
                      className="field"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="Explain why the change is needed"
                    />
                  </Field>
                )}
                <p className="text-xs text-muted-foreground">
                  The system checks the cohort, lecturer, hall, breaks and
                  university rules before accepting the change.
                </p>
                <Button
                  size="sm"
                  disabled={
                    busy ||
                    slot.start >= slot.end ||
                    (mode === "swap" && reason.trim().length < 5)
                  }
                  onClick={() => {
                    if (mode === "reschedule")
                      reschedule.mutate({
                        id: session.id,
                        day: slot.day,
                        startTime: slot.start,
                        endTime: slot.end,
                      });
                    else if (mode === "duplicate")
                      duplicate.mutate({
                        id: session.id,
                        day: slot.day,
                        startTime: slot.start,
                        endTime: slot.end,
                      });
                    else
                      swap.mutate({
                        sessionId: session.id,
                        requestedDay: slot.day,
                        requestedStartTime: slot.start,
                        requestedEndTime: slot.end,
                        reason: reason.trim(),
                      });
                  }}
                >
                  {busy && <Loader2 className="animate-spin" size={14} />}{" "}
                  {mode === "reschedule"
                    ? "Check & move"
                    : mode === "duplicate"
                      ? "Check & duplicate"
                      : "Send request"}
                </Button>
              </div>
            )}
            {mode === "room" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  Assign a lecture hall for {session.day} {session.startTime}–
                  {session.endTime}
                </p>
                <div className="grid max-h-64 gap-1.5 overflow-y-auto">
                  {rooms.isLoading && (
                    <p className="text-sm text-muted-foreground">
                      Checking availability…
                    </p>
                  )}
                  {(rooms.data || []).map(room => (
                    <label
                      key={room.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm",
                        roomId === room.id
                          ? "border-primary ring-2 ring-primary/15"
                          : "border-border",
                        !room.free && "opacity-60"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={roomId === room.id}
                          disabled={!room.free && room.id !== session.roomId}
                          onChange={() => setRoomId(room.id)}
                        />
                        <span className="font-semibold">{room.code}</span>{" "}
                        {room.name}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {room.capacity} seats
                        {room.id === session.roomId ? (
                          <Pill tone="plum">Current</Pill>
                        ) : room.free ? (
                          <Pill tone="green">Free</Pill>
                        ) : (
                          <Pill tone="red">{room.busyWith}</Pill>
                        )}
                        {room.capacity < session.participantCount && (
                          <Pill tone="gold">Small</Pill>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                <Button
                  size="sm"
                  disabled={busy || roomId === session.roomId}
                  onClick={() => assignRoom.mutate({ id: session.id, roomId })}
                >
                  Save hall
                </Button>
              </div>
            )}
            {mode === "staff" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  Lecturers for this session
                </p>
                <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {(staffList.data || [])
                    .filter(
                      p => p.status === "active" || staffIds.includes(p.id)
                    )
                    .map(person => (
                      <label
                        key={person.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm",
                          staffIds.includes(person.id)
                            ? "border-primary"
                            : "border-border"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={staffIds.includes(person.id)}
                          onChange={e =>
                            setStaffIds(ids =>
                              e.target.checked
                                ? [...ids, person.id]
                                : ids.filter(id => id !== person.id)
                            )
                          }
                        />
                        <span className="truncate">{person.name}</span>
                      </label>
                    ))}
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    assignStaff.mutate({ id: session.id, staffIds })
                  }
                >
                  Save lecturers
                </Button>
              </div>
            )}
            {mode === "cancel" && (
              <div className="space-y-3">
                {session.scheduleType === "routine" && (
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={cancelScope === "one"}
                        onChange={() => setCancelScope("one")}
                      />{" "}
                      Only one date
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={cancelScope === "all"}
                        onChange={() => setCancelScope("all")}
                      />{" "}
                      The whole weekly session
                    </label>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {cancelScope === "one" &&
                    session.scheduleType === "routine" && (
                      <Field label="Date">
                        <input
                          className="field"
                          type="date"
                          value={cancelDate}
                          onChange={e => setCancelDate(e.target.value)}
                        />
                      </Field>
                    )}
                  <Field
                    label="Reason (sent to students and lecturers)"
                    className={cancelScope === "all" ? "sm:col-span-2" : ""}
                  >
                    <input
                      className="field"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="e.g. Lecturer on official duty"
                    />
                  </Field>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={
                    busy ||
                    (cancelScope === "one" &&
                      session.scheduleType === "routine" &&
                      !cancelDate)
                  }
                  onClick={() =>
                    cancel.mutate({
                      id: session.id,
                      scope:
                        session.scheduleType === "routine"
                          ? cancelScope
                          : "all",
                      occurrenceDate: cancelDate || undefined,
                      reason: reason || undefined,
                    })
                  }
                >
                  Cancel session
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
