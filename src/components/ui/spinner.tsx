import { cn } from "../../lib/utils";

/** A status spinner. `decorative` hides it from assistive tech, for use inside a labelled control. */
export function Spinner({ className, label = "Loading", decorative = false }: { className?: string; label?: string; decorative?: boolean }) {
  const a11y = decorative || !label ? { "aria-hidden": true as const } : { role: "status", "aria-label": label };
  return (
    <svg className={cn("size-4 animate-spin text-muted-foreground", className)} viewBox="0 0 24 24" fill="none" {...a11y}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
