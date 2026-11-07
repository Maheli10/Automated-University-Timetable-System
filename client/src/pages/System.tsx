import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Megaphone,
  Plus,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { friendlyError } from "@/lib/uov";
import {
  ConfirmButton,
  EmptyState,
  Field,
  KeyValue,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Pill,
  Segmented,
} from "@/components/app/common";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
export function NoticesPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const notices = trpc.notices.list.useQuery();
  const canPost = user?.role === "admin" || user?.role === "lecturer";
  const [form, setForm] = useState({
    title: "",
    message: "",
    audience: "all" as "all" | "student" | "lecturer" | "admin",
    expiresAt: "",
  });
  const create = trpc.notices.create.useMutation({
    onSuccess: () => {
      toast.success("Notice published");
      setForm({ title: "", message: "", audience: "all", expiresAt: "" });
      utils.notices.list.invalidate();
    },
    onError: e => toast.error(friendlyError(e)),
  });
  const remove = trpc.notices.delete.useMutation({
    onSuccess: () => utils.notices.list.invalidate(),
    onError: e => toast.error(friendlyError(e)),
  });
  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Notices"
        description="Timetable changes, cancellations, account messages and announcements."
      />
      <div className={cn("grid gap-6", canPost && "xl:grid-cols-[1fr_380px]")}>
        <div className="space-y-3">
          {notices.isLoading ? (
            <Loading />
          ) : !notices.data?.length ? (
            <EmptyState icon={Megaphone} title="No notices" />
          ) : (
            notices.data.map(n => (
              <div key={n.id} className="panel flex gap-4 p-4">
                <div
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl",
                    /cancel/i.test(n.title)
                      ? "bg-red-50 text-red-700"
                      : /resched|moved|change/i.test(n.title)
                        ? "bg-amber-50 text-amber-700"
                        : "bg-primary/8 text-primary"
                  )}
                >
                  <Megaphone size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{n.title}</p>
                    {n.personal ? (
                      <Pill tone="plum">For you</Pill>
                    ) : (
                      <Pill>
                        {n.audience === "all" ? "Everyone" : `${n.audience}s`}
                      </Pill>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-6 whitespace-pre-line text-muted-foreground">
                    {n.message}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground/80">
                    {new Date(n.createdAt as any).toLocaleString()}
                    {n.expiresAt ? ` · until ${n.expiresAt}` : ""}
                  </p>
                </div>
                {(user?.role === "admin" || n.authorId === user?.id) && (
                  <ConfirmButton
                    size="icon-sm"
                    variant="ghost"
                    title="Delete this notice?"
                    confirmLabel="Delete"
                    onConfirm={() => remove.mutate({ id: n.id })}
                  >
                    <Trash2 size={14} />
                  </ConfirmButton>
                )}
              </div>
            ))
          )}
        </div>
        {canPost && (
          <Panel title="Publish a notice" className="h-fit">
            <div className="grid gap-3">
              <Field label="Title">
                <input
                  className="field"
                  value={form.title}
                  onChange={e =>
                    setForm(f => ({ ...f, title: e.target.value }))
                  }
                />
              </Field>
              <Field label="Message">
                <textarea
                  className="field min-h-32"
                  value={form.message}
                  onChange={e =>
                    setForm(f => ({ ...f, message: e.target.value }))
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Audience">
                  <select
                    className="field"
                    value={form.audience}
                    onChange={e =>
                      setForm(f => ({ ...f, audience: e.target.value as any }))
                    }
                  >
                    <option value="all">Everyone</option>
                    <option value="student">Students</option>
                    <option value="lecturer">Lecturers</option>
                    <option value="admin">Administrators</option>
                  </select>
                </Field>
                <Field label="Show until">
                  <input
                    className="field"
                    type="date"
                    value={form.expiresAt}
                    onChange={e =>
                      setForm(f => ({ ...f, expiresAt: e.target.value }))
                    }
                  />
                </Field>
              </div>
              <Button
                disabled={
                  form.title.length < 2 ||
                  form.message.length < 2 ||
                  create.isPending
                }
                onClick={() =>
                  create.mutate({
                    ...form,
                    expiresAt: form.expiresAt || undefined,
                  })
                }
              >
                <Plus size={14} /> Publish
              </Button>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
export function SettingsPage() {
  const utils = trpc.useUtils();
  const academic = trpc.settings.academic.useQuery();
  const policy = trpc.settings.constraints.useQuery();
  const content = trpc.settings.content.useQuery();
  const notif = trpc.settings.notifications.useQuery();
  const [tab, setTab] = useState<"academic" | "rules" | "notifications">(
    "academic"
  );
  const [a, setA] = useState<any>(null);
  const [p, setP] = useState<any>(null);
  const [json, setJson] = useState("");
  const [n, setN] = useState<any>(null);
  const [c, setC] = useState<any>(null);
  useEffect(() => {
    if (academic.data) setA(academic.data);
  }, [academic.data]);
  useEffect(() => {
    if (policy.data) {
      setP(policy.data);
      setJson(
        JSON.stringify(
          {
            blockedPeriods: policy.data.blockedPeriods,
            customRules: policy.data.customRules,
          },
          null,
          2
        )
      );
    }
  }, [policy.data]);
  useEffect(() => {
    if (notif.data) setN(notif.data);
  }, [notif.data]);
  useEffect(() => {
    if (content.data) setC(content.data);
  }, [content.data]);
  const onError = (e: unknown) => toast.error(friendlyError(e));
  const saveAcademic = trpc.settings.updateAcademic.useMutation({
    onSuccess: () => {
      toast.success("Academic settings saved");
      utils.settings.academic.invalidate();
    },
    onError,
  });
  const savePolicy = trpc.settings.updateConstraints.useMutation({
    onSuccess: () => {
      toast.success("Scheduling rules saved");
      utils.settings.constraints.invalidate();
    },
    onError,
  });
  const saveNotif = trpc.settings.updateNotifications.useMutation({
    onSuccess: () => toast.success("Notification settings saved"),
    onError,
  });
  const saveContent = trpc.settings.updateContent.useMutation({
    onSuccess: () => toast.success("Saved"),
    onError,
  });
  const submitPolicy = () => {
    try {
      const extra = JSON.parse(json || "{}");
      savePolicy.mutate({
        ...p,
        blockedPeriods: extra.blockedPeriods || [],
        customRules: extra.customRules || [],
      });
    } catch {
      toast.error("The blocked periods JSON is not valid.");
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Settings & scheduling rules"
        description="Academic calendar, university timetable rules used by the generator and conflict checker, and notification preferences."
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "academic", label: "Academic year" },
              { value: "rules", label: "Scheduling rules" },
              { value: "notifications", label: "Notifications" },
            ]}
          />
        }
      />
      {tab === "academic" && a && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Academic calendar"
            description="Used to work out each student's current level from their registration year, and as the default semester everywhere."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Academic year">
                <input
                  className="field"
                  value={a.academicYear}
                  onChange={e => setA({ ...a, academicYear: e.target.value })}
                  placeholder="2025/2026"
                />
              </Field>
              <Field label="Current semester">
                <select
                  className="field"
                  value={a.currentSemester}
                  onChange={e =>
                    setA({ ...a, currentSemester: Number(e.target.value) })
                  }
                >
                  <option value={1}>Semester 1</option>
                  <option value={2}>Semester 2</option>
                </select>
              </Field>
              <Field
                label="Default cohort size"
                hint="Used for room sizing when a cohort has no student accounts"
              >
                <input
                  className="field"
                  type="number"
                  min={1}
                  value={a.defaultCohortSize}
                  onChange={e =>
                    setA({ ...a, defaultCohortSize: Number(e.target.value) })
                  }
                />
              </Field>
              <Field
                label="Parallel electives per period"
                hint="How many electives of the same level may run at the same time"
              >
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={6}
                  value={a.maxParallelElectives}
                  onChange={e =>
                    setA({ ...a, maxParallelElectives: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <Button
              className="mt-4"
              onClick={() => saveAcademic.mutate(a)}
              disabled={saveAcademic.isPending}
            >
              <Save size={14} /> Save
            </Button>
          </Panel>
          {c && (
            <Panel title="Faculty information">
              <div className="grid gap-3">
                <Field label="University">
                  <input
                    className="field"
                    value={c.universityName}
                    onChange={e =>
                      setC({ ...c, universityName: e.target.value })
                    }
                  />
                </Field>
                <Field label="Faculty">
                  <input
                    className="field"
                    value={c.facultyName}
                    onChange={e => setC({ ...c, facultyName: e.target.value })}
                  />
                </Field>
              </div>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => saveContent.mutate(c)}
              >
                <Save size={14} /> Save
              </Button>
            </Panel>
          )}
        </div>
      )}
      {tab === "rules" && p && (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Panel
            title="University time rules"
            description="The official periods, breaks and practical slots are fixed by the university."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <KeyValue
                label="Working hours"
                value={`${p.workingHours.start} – ${p.workingHours.end}`}
              />
              <KeyValue
                label="Breaks"
                value={p.breaks
                  .map((b: any) => `${b.label} ${b.start}–${b.end}`)
                  .join(" · ")}
              />
              <KeyValue
                label="Practical slots"
                value={p.practicalSlots
                  .map((s: any) => `${s.start}–${s.end}`)
                  .join(" · ")}
                className="sm:col-span-2"
              />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Field label="Max classes / day / cohort">
                <input
                  className="field"
                  type="number"
                  min={1}
                  value={p.maxBatchClassesPerDay}
                  onChange={e =>
                    setP({
                      ...p,
                      maxBatchClassesPerDay: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Max labs / day / cohort">
                <input
                  className="field"
                  type="number"
                  min={1}
                  value={p.maxBatchPracticalsPerDay}
                  onChange={e =>
                    setP({
                      ...p,
                      maxBatchPracticalsPerDay: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Max consecutive lectures">
                <input
                  className="field"
                  type="number"
                  min={1}
                  value={p.maxConsecutiveLectures}
                  onChange={e =>
                    setP({
                      ...p,
                      maxConsecutiveLectures: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              {[
                [
                  "preventSameSubjectSameDay",
                  "Spread each course over different days",
                ],
                [
                  "enforcePracticalSlots",
                  "Practicals only in the official 2-hour practical slots",
                ],
                ["enforceBreaks", "Never schedule over tea and lunch breaks"],
                ["enforceWorkingHours", "Stay within working hours"],
                ["enforceBlockedPeriods", "Respect blocked university periods"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(p[key])}
                    onChange={e => setP({ ...p, [key]: e.target.checked })}
                  />{" "}
                  {label}
                </label>
              ))}
            </div>
          </Panel>
          <Panel
            title="Blocked university periods"
            description="Faculty meetings, ceremonies or exams when no class may be scheduled. Edit as JSON."
          >
            <textarea
              className="field min-h-72 font-mono text-xs"
              value={json}
              onChange={e => setJson(e.target.value)}
              spellCheck={false}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Example:{" "}
              {`{"blockedPeriods":[{"day":"Wednesday","start":"13:30","end":"16:35","label":"Faculty board"}],"customRules":[]}`}
            </p>
            <Button
              className="mt-4"
              onClick={submitPolicy}
              disabled={savePolicy.isPending}
            >
              <Save size={14} /> Save rules
            </Button>
          </Panel>
        </div>
      )}
      {tab === "notifications" && n && (
        <Panel
          title="Notifications"
          description="Timetable changes always appear on the dashboards of the affected lecturers and students. E-mail delivery requires EMAIL_WEBHOOK_URL in .env."
          className="max-w-2xl"
        >
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={n.enabled}
                onChange={e => setN({ ...n, enabled: e.target.checked })}
              />{" "}
              Send administrator alerts
            </label>
            {(["cancellation", "reschedule", "rejection"] as const).map(k => (
              <label
                key={k}
                className="flex items-center gap-2 pl-6 capitalize"
              >
                <input
                  type="checkbox"
                  checked={n.events[k]}
                  onChange={e =>
                    setN({
                      ...n,
                      events: { ...n.events, [k]: e.target.checked },
                    })
                  }
                />{" "}
                {k === "rejection" ? "Rejected (clashing) changes" : `${k}s`}
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Timing">
              <select
                className="field"
                value={n.timing}
                onChange={e => setN({ ...n, timing: e.target.value })}
              >
                <option value="immediate">Immediately</option>
                <option value="daily-digest">Daily digest</option>
                <option value="weekly-digest">Weekly digest</option>
              </select>
            </Field>
            <Field label="Extra recipients">
              <input
                className="field"
                value={n.recipients}
                onChange={e => setN({ ...n, recipients: e.target.value })}
                placeholder="dean@vau.ac.lk"
              />
            </Field>
          </div>
          <Button className="mt-4" onClick={() => saveNotif.mutate(n)}>
            <Save size={14} /> Save
          </Button>
        </Panel>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
export function ProfilePage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const mine = trpc.profiles.mine.useQuery();
  const [form, setForm] = useState<any>({
    phone: "",
    education: "",
    qualifications: "",
    department: "General",
    bio: "",
    photoUrl: "",
  });
  useEffect(() => {
    const v: any = mine.data?.pending || mine.data?.profile || {};
    setForm({
      phone: v.phone || user?.phone || "",
      education: v.education || "",
      qualifications: v.qualifications || user?.qualifications || "",
      department:
        v.department ||
        (user?.program === "AMC"
          ? "AMC"
          : user?.program === "IT"
            ? "IT"
            : "General"),
      bio: v.bio || "",
      photoUrl: v.photoUrl || "",
    });
  }, [mine.data]);
  const submit = trpc.profiles.submit.useMutation({
    onSuccess: () => {
      toast.success("Profile sent to the administrator for approval");
      utils.profiles.mine.invalidate();
    },
    onError: e => toast.error(friendlyError(e)),
  });
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <>
      <PageHeader eyebrow="Account" title="My profile" />
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Panel>
          <div className="flex flex-col items-center text-center">
            {form.photoUrl ? (
              <img
                src={form.photoUrl}
                alt=""
                className="size-20 rounded-full object-cover"
              />
            ) : (
              <div className="grid size-20 place-items-center rounded-full bg-primary text-2xl font-bold text-white">
                {(user?.name || "U").slice(0, 1)}
              </div>
            )}
            <p className="mt-3 text-lg font-bold">{user?.name}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <Pill tone="plum" className="mt-2 capitalize">
              {user?.roleTitle || user?.role}
            </Pill>
          </div>
          <div className="mt-5 grid gap-2">
            {user?.role === "student" && (
              <KeyValue
                label="Cohort"
                value={
                  user.level
                    ? `Level ${user.level} · ${user.program}`
                    : "Not set"
                }
              />
            )}
            {user?.registrationNo && (
              <KeyValue label="Registration no." value={user.registrationNo} />
            )}
            {user?.staffCode && (
              <KeyValue label="Staff code" value={user.staffCode} />
            )}
            {user?.academicYear && (
              <KeyValue label="Batch" value={user.academicYear} />
            )}
          </div>
        </Panel>
        <Panel
          title="Profile details"
          description="Changes are reviewed by the administrator before they go live."
        >
          {mine.data?.pending && (
            <div className="mb-4">
              <Notice tone="gold">
                Your last update is waiting for approval.
              </Notice>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Phone">
              <input
                className="field"
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Department">
              <select
                className="field"
                value={form.department}
                onChange={e => set("department", e.target.value)}
              >
                <option>IT</option>
                <option>AMC</option>
                <option>General</option>
              </select>
            </Field>
            <Field label="Photo URL" className="md:col-span-2">
              <input
                className="field"
                value={form.photoUrl}
                onChange={e => set("photoUrl", e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Education" className="md:col-span-2">
              <input
                className="field"
                value={form.education}
                onChange={e => set("education", e.target.value)}
              />
            </Field>
            <Field label="Qualifications" className="md:col-span-2">
              <textarea
                className="field"
                value={form.qualifications}
                onChange={e => set("qualifications", e.target.value)}
              />
            </Field>
            <Field label="About" className="md:col-span-2">
              <textarea
                className="field"
                value={form.bio}
                onChange={e => set("bio", e.target.value)}
              />
            </Field>
          </div>
          <Button
            className="mt-4"
            onClick={() =>
              submit.mutate({ ...form, photoUrl: form.photoUrl || "" })
            }
            disabled={submit.isPending}
          >
            <Save size={14} /> Submit for approval
          </Button>
        </Panel>
      </div>
    </>
  );
}

export function ProfileApprovalsPage() {
  const utils = trpc.useUtils();
  const pending = trpc.profiles.pending.useQuery();
  const approve = trpc.profiles.approve.useMutation({
    onSuccess: (_, v) => {
      toast.success(v.approved ? "Approved" : "Rejected");
      utils.profiles.pending.invalidate();
    },
    onError: e => toast.error(friendlyError(e)),
  });
  return (
    <>
      <PageHeader
        eyebrow="Approval flow"
        title="Profile approvals"
        description="Profile updates submitted by lecturers and students."
      />
      {pending.isLoading ? (
        <Loading />
      ) : !pending.data?.length ? (
        <EmptyState icon={UserRound} title="No pending profile updates" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {pending.data.map(item => (
            <div key={item.key} className="panel p-4">
              <div className="flex items-start gap-3">
                {item.value.photoUrl ? (
                  <img
                    src={item.value.photoUrl}
                    alt=""
                    className="size-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid size-12 place-items-center rounded-full bg-primary/10 font-bold text-primary">
                    {String(item.value.name || "U").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {item.value.name || `User #${item.userId}`}{" "}
                    <Pill className="ml-1 capitalize">
                      {item.value.role || "user"}
                    </Pill>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.value.email} · submitted{" "}
                    {new Date(item.value.submittedAt).toLocaleString()}
                  </p>
                  <div className="mt-2 grid gap-1 text-sm">
                    {[
                      "phone",
                      "department",
                      "education",
                      "qualifications",
                      "bio",
                    ]
                      .filter(k => item.value[k])
                      .map(k => (
                        <p key={k}>
                          <span className="text-muted-foreground capitalize">
                            {k}:
                          </span>{" "}
                          {item.value[k]}
                        </p>
                      ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    approve.mutate({ userId: item.userId, approved: false })
                  }
                >
                  <X size={14} /> Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    approve.mutate({ userId: item.userId, approved: true })
                  }
                >
                  <Check size={14} /> Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
