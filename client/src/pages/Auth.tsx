import { useState } from "react";
import { toast } from "sonner";
import {
  CalendarCheck2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const roles = [
  { value: "student" as const, label: "Student", icon: GraduationCap },
  { value: "lecturer" as const, label: "Lecturer", icon: UserRound },
  { value: "admin" as const, label: "Admin", icon: ShieldCheck },
];

export function LoginPage() {
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [role, setRole] = useState<"admin" | "lecturer" | "student">("student");
  const login = trpc.auth.login.useMutation({
    onSuccess: user => {
      utils.auth.me.setData(undefined, user);
      toast.success(`Welcome, ${user.name || user.email}`);
    },
    onError: e => toast.error(e.message),
  });
  const placeholder =
    role === "student"
      ? "2022ict114@stu.vau.ac.lk or 2022/ICT/114"
      : role === "lecturer"
        ? "name@vau.ac.lk"
        : "admin@uov.local";
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (
      role === "lecturer" &&
      value.includes("@") &&
      !value.endsWith("@vau.ac.lk")
    )
      return toast.error("Lecturers sign in with their @vau.ac.lk email.");
    login.mutate({ email: value, password: password || undefined, role });
  };
  const preview = [
    ["08:30", "IT1134", "Programming Lab", "bg-sky-400/25 border-sky-300/40"],
    [
      "10:40",
      "CSH4144",
      "Machine Learning",
      "bg-indigo-400/25 border-indigo-300/40",
    ],
    [
      "13:30",
      "ACU1113",
      "English Language I",
      "bg-teal-400/25 border-teal-300/40",
    ],
  ];
  return (
    <div className="relative min-h-screen overflow-hidden bg-navy text-white">
      <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(147,197,253,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(147,197,253,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="pointer-events-none absolute -top-40 left-1/3 size-[640px] rounded-full bg-blue-600/40 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 bottom-0 size-[420px] rounded-full bg-sky-400/25 blur-[100px]" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_440px]">
        <div className="hidden lg:block">
          <div className="flex items-center gap-3">
            <img
              src="/assets/uov-crest.png"
              alt=""
              className="size-12 rounded-full bg-white p-0.5"
            />
            <div>
              <p className="font-display text-lg font-bold">
                University of Vavuniya
              </p>
              <p className="text-xs text-blue-200/70">
                Faculty of Applied Science · Department of Physical Science
              </p>
            </div>
          </div>
          <h1 className="mt-12 max-w-xl font-display text-5xl leading-[1.05] font-bold">
            Your week,
            <br />
            <span className="bg-gradient-to-r from-sky-300 to-blue-200 bg-clip-text text-transparent">
              perfectly scheduled.
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-blue-100/75">
            Automated semester timetables for every IT and AMC cohort — with
            lecturers, lecture halls and labs matched without a single clash.
          </p>
          <div className="mt-10 max-w-md space-y-2.5">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-blue-200/60 uppercase">
              Today · Level 1
            </p>
            {preview.map(([time, code, name, tone]) => (
              <div
                key={code}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border px-4 py-3 backdrop-blur",
                  tone
                )}
              >
                <span className="font-display text-sm font-semibold tabular">
                  {time}
                </span>
                <span className="h-6 w-px bg-white/20" />
                <span className="text-sm">
                  <b>{code}</b> <span className="text-blue-100/80">{name}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={submit}
          className="w-full rounded-[28px] bg-white p-7 text-foreground shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] sm:p-9"
        >
          <img
            src="/assets/uov-logo.png"
            alt="University of Vavuniya"
            className="h-11 w-auto"
          />
          <h2 className="mt-7 font-display text-[26px] font-bold text-navy">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with the account created by the faculty administrator.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {roles.map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setRole(item.value);
                  setShow(false);
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-xs font-semibold transition",
                  role === item.value
                    ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/15"
                    : "border-border text-muted-foreground hover:border-blue-200 hover:text-foreground"
                )}
              >
                <item.icon size={18} /> {item.label}
              </button>
            ))}
          </div>
          <label className="mt-5 block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {role === "student"
                ? "University email or registration no."
                : "University email"}
            </span>
            <input
              className="field h-12"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={placeholder}
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Password
            </span>
            <div className="relative">
              <input
                className="field h-12 pr-10"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Leave empty on your first sign-in"
              />
              <button
                type="button"
                onPointerEnter={() => setShow(true)}
                onPointerLeave={() => setShow(false)}
                onPointerDown={() => setShow(true)}
                onPointerUp={() => setShow(false)}
                onPointerCancel={() => setShow(false)}
                onFocus={() => setShow(true)}
                onBlur={() => setShow(false)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
                aria-label="Hold or hover to show password"
                title="Hold or hover to show password"
              >
                {show ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          </label>
          <Button
            type="submit"
            disabled={login.isPending || !email}
            className="mt-6 h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-semibold hover:from-blue-700 hover:to-indigo-700"
          >
            {login.isPending ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <KeyRound size={16} />
            )}{" "}
            Sign in as {role}
          </Button>
          <div className="mt-5 flex gap-3 rounded-2xl bg-blue-50 p-4 text-xs leading-5 text-blue-900">
            <CalendarCheck2
              size={18}
              className="mt-0.5 shrink-0 text-primary"
            />
            <p>
              <b>First time?</b> Enter your university email, leave the password
              empty and continue — you'll then create your own password. Only
              accounts created by the administrator can sign in.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ChangePasswordPage({
  forceSetup = false,
}: {
  forceSetup?: boolean;
}) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const change = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      toast.success(
        forceSetup ? "Password created — welcome!" : "Password updated"
      );
      await utils.auth.me.invalidate();
      setCurrent("");
      setNext("");
      setConfirm("");
      if (forceSetup) window.location.replace("/");
      else setLocation("/");
    },
    onError: e => toast.error(e.message),
  });
  const strength = [
    next.length >= 8,
    /[A-Z]/.test(next),
    /[0-9]/.test(next),
    /[^A-Za-z0-9]/.test(next),
  ].filter(Boolean).length;
  const body = (
    <form
      className="w-full max-w-md"
      onSubmit={e => {
        e.preventDefault();
        if (next !== confirm)
          return toast.error("The two new passwords do not match.");
        change.mutate({
          currentPassword: forceSetup ? undefined : current,
          newPassword: next,
        });
      }}
    >
      {forceSetup && (
        <img
          src="/assets/uov-logo.png"
          alt="University of Vavuniya"
          className="mb-8 h-11 w-auto"
        />
      )}
      <h2 className="text-2xl font-bold">
        {forceSetup ? "Create your password" : "Change password"}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {forceSetup
          ? "This is your first sign-in. Choose a private password to protect your account."
          : "Update the password you use to sign in."}
      </p>
      {!forceSetup && (
        <label className="mt-5 block">
          <span className="label">Current password</span>
          <PasswordInput
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
        </label>
      )}
      <label className="mt-4 block">
        <span className="label">New password</span>
        <PasswordInput
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </label>
      <div className="mt-2 flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < strength
                ? strength >= 3
                  ? "bg-emerald-500"
                  : "bg-gold"
                : "bg-muted"
            )}
          />
        ))}
      </div>
      <label className="mt-4 block">
        <span className="label">Confirm new password</span>
        <PasswordInput
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
      </label>
      <Button
        type="submit"
        className="mt-6 h-11 w-full"
        disabled={next.length < 8 || change.isPending}
      >
        {change.isPending && <Loader2 className="animate-spin" size={16} />}{" "}
        {forceSetup ? "Create password" : "Save password"}
      </Button>
    </form>
  );
  if (forceSetup)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-sky-100 p-6">
        <div className="panel flex w-full max-w-md justify-center p-8">
          {body}
        </div>
      </div>
    );
  return (
    <div className="panel mx-auto mt-4 flex max-w-xl justify-center p-8">
      {body}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative mt-1.5">
      <input
        className="field h-11 pr-10"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onPointerEnter={() => setVisible(true)}
        onPointerLeave={() => setVisible(false)}
        onPointerDown={() => setVisible(true)}
        onPointerUp={() => setVisible(false)}
        onPointerCancel={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
        aria-label="Hold or hover to show password"
        title="Hold or hover to show password"
      >
        {visible ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
    </div>
  );
}
