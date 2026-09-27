import type { ReactNode } from "react";

export function Screen({ children }: { children: ReactNode }) {
  return <div className="min-h-full pt-safe pb-safe px-4 max-w-xl mx-auto">{children}</div>;
}

export function TopBar({
  title,
  back,
  right,
}: {
  title: ReactNode;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 py-3">
      {back && (
        <a
          href={back}
          aria-label="Zurück"
          className="-ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
      )}
      <h1 className="flex-1 truncate text-[22px] font-bold tracking-tight">{title}</h1>
      {right}
    </header>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/10 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand to-teal-500 transition-[width] duration-500"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

export function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${count} von 3 Sternen`}>
      {[0, 1, 2].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`h-4 w-4 ${i < count ? "text-amber" : "text-black/15 dark:text-white/15"}`}
          fill="currentColor"
        >
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5-4.9-4.6 6.6-.8z" />
        </svg>
      ))}
    </span>
  );
}

export function LockIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 118 0v3" />
    </svg>
  );
}

export function Card({
  children,
  className = "",
  href,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const cls = `block rounded-2xl bg-[var(--surface-solid)] border border-[var(--line)] p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${href ? "active:scale-[0.99] transition-transform" : ""} ${className}`;
  return href ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center text-[var(--muted)]">
      {children}
    </div>
  );
}
