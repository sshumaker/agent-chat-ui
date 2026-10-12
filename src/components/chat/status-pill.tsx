import { WifiOffIcon } from "lucide-react";

import { Spinner } from "../ui/spinner";
import { STATUS_LABEL, type ThreadStatus } from "../../lib/view-model";
import { cn } from "../../lib/utils";

export function StatusPill({ status, className }: { status: ThreadStatus; className?: string }) {
  if (status === "idle") return null;
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="thread-status"
      data-status={status}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium animate-fade-in",
        status === "waiting" && "bg-warning-soft text-warning",
        (status === "working" || status === "starting") && "bg-accent-soft text-accent-foreground",
        status === "reconnecting" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {status === "waiting" ? <span className="size-1.5 rounded-full bg-warning animate-pulse-soft" /> : null}
      {status === "working" || status === "starting" ? <Spinner className="size-3 text-current" label="" /> : null}
      {status === "reconnecting" ? <WifiOffIcon className="size-3" /> : null}
      {STATUS_LABEL[status]}
    </span>
  );
}
