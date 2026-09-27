import type { ReactNode } from "react";

export const SHEET_PADDING = { top: 110, bottom: 230, left: 24, right: 24 };

/** Full-screen map with a glass header and a bottom sheet for the controls. */
export function GameShell({
  back,
  title,
  subtitle,
  progress,
  right,
  map,
  children,
  bottomInset = 0,
}: {
  back: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** 0–1, shown as a thin bar under the header. */
  progress?: number;
  right?: ReactNode;
  map: ReactNode;
  children: ReactNode;
  bottomInset?: number;
}) {
  return (
    <div className="fixed inset-0 overflow-hidden">
      {map}
      <div className="pointer-events-none absolute inset-x-0 top-0 pt-safe px-3">
        <div className="glass pointer-events-auto mx-auto max-w-xl overflow-hidden rounded-2xl shadow-lg">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <a
              href={back}
              aria-label="Zurück"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
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
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{title}</p>
              {subtitle && <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>}
            </div>
            {right}
          </div>
          {progress !== undefined && (
            <div className="h-1 bg-black/5 dark:bg-white/10">
              <div
                className="h-full bg-brand transition-[width] duration-500"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 pb-safe px-3 transition-transform duration-200"
        style={{ transform: bottomInset ? `translateY(-${bottomInset}px)` : undefined }}
      >
        <div className="glass pointer-events-auto mx-auto max-w-xl rounded-3xl p-4 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow active:scale-[0.99] ${className}`}
    >
      {children}
    </button>
  );
}
