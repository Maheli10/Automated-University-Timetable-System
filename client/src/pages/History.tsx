import { useEffect, useState } from "react";
import { CalendarDays, History as HistoryIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { EmptyState, Loading, PageHeader, Pill } from "@/components/app/common";
import WeeklyGrid from "@/components/app/WeeklyGrid";
import { DEFAULT_PERIODS, type SessionRow } from "@/lib/uov";

export function NotificationsPage() {
  const utils = trpc.useUtils();
  const rows = trpc.notifications.list.useQuery(undefined, { refetchInterval: 30_000 });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.unreadCount.invalidate(); } });
  const markAll = trpc.notifications.markAllRead.useMutation({ onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.unreadCount.invalidate(); } });
  useEffect(() => {
    if (rows.data?.some(row => !row.isRead) && !markAll.isPending) markAll.mutate();
  }, [rows.data]);
  return <><PageHeader eyebrow="Communication" title="Notifications" description="Timetable publications, changes, cancellations, requests and announcements." actions={<button className="button" onClick={() => markAll.mutate()} disabled={markAll.isPending}>Mark all as read</button>} />
    {rows.isLoading ? <Loading /> : !rows.data?.length ? <EmptyState icon={CalendarDays} title="You’re all caught up" description="New notifications will appear here." /> : <div className="space-y-3">{[...rows.data].reverse().map(row => <article key={row.id} className={`panel flex gap-4 p-4 ${!row.isRead ? "border-primary/30 bg-primary/[0.03]" : ""}`} onClick={() => !row.isRead && markRead.mutate({ id: row.id })} role="button" tabIndex={0}>
      <span className={`mt-1 size-2 shrink-0 rounded-full ${row.isRead ? "bg-transparent" : "bg-primary"}`} />
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{row.title}</h2><Pill>{row.type}</Pill>{row.semester && <Pill>Semester {row.semester}</Pill>}</div><p className="mt-1 whitespace-pre-line text-sm leading-6 text-muted-foreground">{row.message}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(row.createdAt as any).toLocaleString()}</p></div>
    </article>)}</div>}
  </>;
}

export function HistoryPage() {
  const { user } = useAuth();
  const query = trpc.history.list.useQuery();
  const [selected, setSelected] = useState<number | null>(null);
  return <><PageHeader eyebrow="Timetable records" title="History" description={user?.role === "admin" ? "Previously published timetables. Select a semester to view its read-only timetable." : "Previously published timetables relevant to your cohort or teaching assignments."} />
    {query.isLoading ? <Loading /> : !query.data?.length ? <EmptyState icon={HistoryIcon} title="No timetable history yet" description="Previously published timetables will appear here." /> : <div className="space-y-4">{query.data.map(item => {
      const isOpen = selected === item.id;
      const sessions = item.sessions.map((session: any) => ({ ...session,
        staff: (session.lecturerNames || []).map((name: string, index: number) => ({ id: session.lecturerIds[index], name })),
        staffIds: session.lecturerIds || [], cohorts: [],
      })) as SessionRow[];
      return <section key={item.id} className="panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{item.academicYear} · Semester {item.semester}</p><h2 className="mt-1 text-lg font-bold">Timetable</h2><p className="text-sm text-muted-foreground">Published {new Date(item.publishedAt as any).toLocaleString()} · by {item.publisherName || "Administrator"}</p></div><Pill tone="green">{item.finalStatus}</Pill></div>
        {user?.role === "admin" && <div className="mt-4 flex flex-wrap gap-2 text-sm"><Pill>{item.sessionCount} sessions</Pill><Pill>{item.changeCount} changes</Pill><Pill>{item.cancellationCount} cancellations</Pill></div>}
        <button className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setSelected(isOpen ? null : item.id)}>{isOpen ? "Hide timetable" : "View timetable"} · {sessions.length} sessions</button>
        {isOpen && <div className="mt-4"><WeeklyGrid sessions={sessions} periods={DEFAULT_PERIODS} showCohort showLecturer /><p className="mt-2 text-xs text-muted-foreground">Read-only published timetable · {item.academicYear} · Semester {item.semester}</p></div>}
      </section>;
    })}</div>}
  </>;
}
