import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  Bell,
  BookOpen,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  FileUp,
  GitPullRequestArrow,
  GraduationCap,
  Home,
  KeyRound,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  Sparkles,
  UserCircle2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useSemester } from "@/contexts/SemesterContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Role = "admin" | "lecturer" | "student";
type Leaf = { label: string; path: string; icon: any; hint?: string };
type Entry = Leaf | { label: string; icon: any; items: Leaf[] };

const MENUS: Record<Role, Entry[]> = {
  admin: [
    { label: "Home", path: "/", icon: Home },
    { label: "Timetable", path: "/timetable", icon: CalendarDays },
    {
      label: "Scheduling",
      icon: Sparkles,
      items: [
        {
          label: "Generate timetable",
          path: "/generate",
          icon: Sparkles,
          hint: "Build a semester for every level",
        },
        {
          label: "Sessions & changes",
          path: "/sessions",
          icon: CalendarRange,
          hint: "Move, cancel, reassign sessions",
        },
        {
          label: "Change requests",
          path: "/requests",
          icon: GitPullRequestArrow,
          hint: "Approve lecturer requests",
        },
      ],
    },
    {
      label: "Academics",
      icon: BookOpen,
      items: [
        {
          label: "Course catalogue",
          path: "/courses",
          icon: BookOpen,
          hint: "Declare courses & outcomes",
        },
        {
          label: "Course assignment",
          path: "/assignments",
          icon: BookOpenCheck,
          hint: "Lecturers & preferred halls",
        },
        {
          label: "Lecturers",
          path: "/lecturers",
          icon: GraduationCap,
          hint: "Staff and teaching profiles",
        },
        {
          label: "Lecture halls & labs",
          path: "/rooms",
          icon: Building2,
          hint: "Rooms and free-room finder",
        },
        {
          label: "Student accounts",
          path: "/students",
          icon: Users,
          hint: "Who can sign in",
        },
        {
          label: "Bulk import",
          path: "/import",
          icon: FileUp,
          hint: "CSV upload for all data",
        },
      ],
    },
    { label: "Analytics", path: "/analytics", icon: BarChart3 },
    {
      label: "Admin",
      icon: Settings,
      items: [
        {
          label: "Notices",
          path: "/notices",
          icon: Megaphone,
          hint: "Announcements",
        },
        {
          label: "Profile approvals",
          path: "/profile-approvals",
          icon: ClipboardList,
          hint: "Pending profile updates",
        },
        {
          label: "Settings & rules",
          path: "/settings",
          icon: Settings,
          hint: "Academic year, scheduling rules",
        },
      ],
    },
  ],
  lecturer: [
    { label: "Home", path: "/", icon: Home },
    { label: "Timetable", path: "/timetable", icon: CalendarDays },
    { label: "My sessions", path: "/sessions", icon: CalendarRange },
    { label: "Requests", path: "/requests", icon: GitPullRequestArrow },
    { label: "My courses", path: "/courses", icon: BookOpen },
    { label: "Halls", path: "/rooms", icon: Building2 },
    { label: "Notices", path: "/notices", icon: Megaphone },
  ],
  student: [
    { label: "Home", path: "/", icon: Home },
    { label: "My timetable", path: "/timetable", icon: CalendarDays },
    { label: "My courses", path: "/courses", icon: BookOpen },
    { label: "Notices", path: "/notices", icon: Megaphone },
  ],
};

const roleLabel: Record<Role, string> = {
  admin: "Administrator",
  lecturer: "Lecturer",
  student: "Student",
};

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const role = (user?.role || "student") as Role;
  const { semester, setSemester, academicYear } = useSemester();
  const noticeQuery = trpc.notices.list.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const recent = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return (noticeQuery.data || []).filter(
      n => new Date(n.createdAt as any).getTime() > weekAgo
    );
  }, [noticeQuery.data]);
  const entries = MENUS[role];
  const isActive = (path: string) =>
    path === "/"
      ? location === "/"
      : location === path || location.startsWith(`${path}/`);
  const initials = (user?.name || user?.email || "U")
    .replace(/^(Mr|Ms|Mrs|Dr|Prof)\.?\s*/i, "")
    .split(/\s+/)
    .map(p => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-40 bg-navy text-white shadow-[0_6px_24px_-12px_rgba(11,27,63,0.6)]">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 md:px-6">
          <button
            className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <img
              src="/assets/uov-crest.png"
              alt="University of Vavuniya crest"
              className="size-9 rounded-full bg-white p-0.5"
            />
            <span className="hidden leading-tight sm:block">
              <span className="block font-display text-[15px] font-bold tracking-tight">
                UOV Timetable
              </span>
              <span className="block text-[10.5px] text-blue-200/80">
                Faculty of Applied Science
              </span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-0.5 lg:flex">
            {entries.map(entry =>
              "path" in entry ? (
                <Link
                  key={entry.label}
                  href={entry.path}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition",
                    isActive(entry.path)
                      ? "bg-white text-navy shadow-sm"
                      : "text-blue-100/85 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <entry.icon size={15} />
                  {entry.label}
                </Link>
              ) : (
                <DropdownMenu key={entry.label}>
                  <DropdownMenuTrigger
                    className={cn(
                      "flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium outline-none transition",
                      entry.items.some(i => isActive(i.path))
                        ? "bg-white text-navy shadow-sm"
                        : "text-blue-100/85 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10"
                    )}
                  >
                    <entry.icon size={15} />
                    {entry.label}
                    <ChevronDown size={13} className="opacity-70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={10}
                    className="w-[300px] rounded-2xl p-2"
                  >
                    {entry.items.map(item => (
                      <DropdownMenuItem
                        key={item.path}
                        onClick={() => setLocation(item.path)}
                        className={cn(
                          "items-start gap-3 rounded-xl p-2.5",
                          isActive(item.path) && "bg-accent"
                        )}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <item.icon size={17} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">
                            {item.label}
                          </span>
                          {item.hint && (
                            <span className="block text-xs text-muted-foreground">
                              {item.hint}
                            </span>
                          )}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div
              className="flex items-center rounded-full bg-white/10 p-1"
              title={`Academic year ${academicYear}`}
            >
              <span className="hidden px-2 text-[11px] font-medium text-blue-100/80 xl:inline">
                {academicYear}
              </span>
              {[1, 2].map(value => (
                <button
                  key={value}
                  onClick={() => setSemester(value as 1 | 2)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold transition",
                    semester === value
                      ? "bg-sky-400 text-navy"
                      : "text-blue-100 hover:text-white"
                  )}
                >
                  S{value}
                </button>
              ))}
            </div>
            <button
              onClick={() => setLocation("/notices")}
              className="relative rounded-full p-2 text-blue-100 hover:bg-white/10 hover:text-white"
              aria-label="Notices"
            >
              <Bell size={18} />
              {recent.length > 0 && (
                <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-navy">
                  {recent.length > 9 ? "9+" : recent.length}
                </span>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pr-1 pl-1 outline-none hover:bg-white/10 md:pr-3">
                <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-xs font-bold text-white ring-2 ring-white/20">
                  {initials}
                </span>
                <span className="hidden text-left md:block">
                  <span className="block max-w-[160px] truncate text-[13px] leading-4 font-semibold">
                    {user?.name || user?.email}
                  </span>
                  <span className="block text-[11px] text-blue-200/80">
                    {roleLabel[role]}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className="w-64 rounded-2xl p-2"
              >
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-semibold">{user?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user?.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="rounded-lg"
                  onClick={() => setLocation("/profile")}
                >
                  <UserCircle2 size={15} /> My profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-lg"
                  onClick={() => setLocation("/change-password")}
                >
                  <KeyRound size={15} /> Change password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="rounded-lg text-destructive focus:text-destructive"
                  onClick={() => void logout()}
                >
                  <LogOut size={15} /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-navy/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[290px] flex-col overflow-y-auto bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 font-display font-bold text-navy">
                <img src="/assets/uov-crest.png" alt="" className="size-8" />{" "}
                UOV Timetable
              </span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 hover:bg-muted"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            {entries.map(entry => {
              const items = "path" in entry ? [entry] : entry.items;
              return (
                <div key={entry.label} className="mb-3">
                  {!("path" in entry) && (
                    <p className="mb-1 px-3 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                      {entry.label}
                    </p>
                  )}
                  {items.map(item => (
                    <Link
                      key={item.path + item.label}
                      href={item.path}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                        isActive(item.path)
                          ? "bg-primary text-white"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <item.icon size={16} /> {item.label}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
      <footer className="no-print mx-auto max-w-[1440px] px-6 pb-8 text-xs text-muted-foreground">
        University of Vavuniya · Faculty of Applied Science · Department of
        Physical Science
      </footer>
    </div>
  );
}
