import { useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-sky-100/60 px-5 py-6 md:px-8 md:py-7">
      <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(#93c5fd_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent_60%)]" />
      <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-blue-400/15 blur-2xl" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <span className="size-1.5 rounded-full bg-sky-500" />
              {eyebrow}
            </span>
          )}
          <h1 className="text-2xl font-bold text-navy md:text-[30px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="no-print flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel min-w-0", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const tones = {
  plum: "bg-blue-50 text-blue-700",
  gold: "bg-amber-50 text-amber-700",
  blue: "bg-sky-50 text-sky-700",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-600",
};
const solid = {
  plum: "from-blue-600 to-indigo-600",
  gold: "from-amber-400 to-orange-500",
  blue: "from-sky-400 to-cyan-600",
  green: "from-emerald-400 to-teal-600",
  red: "from-rose-500 to-red-600",
  slate: "from-slate-400 to-slate-600",
};
export type Tone = keyof typeof tones;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "plum",
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: any;
  tone?: Tone;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "panel group relative overflow-hidden p-4",
        onClick &&
          "cursor-pointer transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg"
      )}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm",
              solid[tone]
            )}
          >
            <Icon size={18} />
          </div>
        )}
        <p className="text-[12.5px] leading-4 font-medium text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="tabular mt-3 font-display text-[28px] leading-none font-bold text-navy">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Pill({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: any;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white/60 px-6 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-primary/8 text-primary">
        <Icon size={22} />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

export function Notice({
  tone = "gold",
  title,
  children,
  icon: Icon = AlertTriangle,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: any;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm",
        tone === "gold"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : tone === "red"
            ? "border-red-200 bg-red-50 text-red-900"
            : tone === "green"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : tone === "blue"
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : "border-border bg-muted text-foreground"
      )}
    >
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && (
          <div className={cn("leading-6", title && "mt-0.5 opacity-90")}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        size={15}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
      />
      <input
        className="field pl-9"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-full border border-border bg-white p-1 shadow-xs",
        className
      )}
    >
      {options.map(option => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
            option.value === value
              ? "bg-primary text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Button that asks for confirmation before running a destructive action. */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  variant = "outline",
  size = "sm",
  className,
  disabled,
  destructive = true,
}: {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: "outline" | "destructive" | "ghost" | "default" | "secondary";
  size?: "sm" | "default" | "icon" | "icon-sm";
  className?: string;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && (
              <AlertDialogDescription>{description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                destructive
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function KeyValue({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-muted/70 px-3 py-2.5", className)}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">
        {value || "—"}
      </p>
    </div>
  );
}

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("scrollbar-thin overflow-x-auto", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export const th =
  "border-b border-border bg-muted/50 px-3 py-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase whitespace-nowrap";
export const td = "border-b border-border/70 px-3 py-2.5 align-middle";

export function ProgressBar({
  value,
  tone = "plum",
  className,
}: {
  value: number;
  tone?: "plum" | "gold" | "green" | "red";
  className?: string;
}) {
  const color =
    tone === "gold"
      ? "bg-gold"
      : tone === "green"
        ? "bg-emerald-600"
        : tone === "red"
          ? "bg-red-600"
          : "bg-primary";
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
