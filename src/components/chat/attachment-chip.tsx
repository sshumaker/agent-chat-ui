"use client";

import { AlertCircleIcon, FileIcon, FileImageIcon, FileTextIcon, XIcon } from "lucide-react";

import { Spinner } from "../ui/spinner";
import { formatBytes } from "../../lib/view-model";
import { cn } from "../../lib/utils";

export type ChipStatus = "uploading" | "ready" | "error";

function FileGlyph({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImageIcon className="size-4" />;
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("pdf")) return <FileTextIcon className="size-4" />;
  return <FileIcon className="size-4" />;
}

export function AttachmentChip({
  name,
  mime,
  size,
  status = "ready",
  error,
  onRemove,
  className,
}: {
  name: string;
  mime: string;
  size: number;
  status?: ChipStatus;
  error?: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <div
      data-testid="attachment-chip"
      data-status={status}
      title={error ?? name}
      className={cn(
        "group/chip flex max-w-60 items-center gap-2 rounded-xl border bg-surface py-1.5 pr-2 pl-2 text-sm",
        status === "error" ? "border-danger/40 bg-danger-soft" : "border-border",
        className,
      )}
    >
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", status === "error" ? "text-danger" : "bg-muted text-muted-foreground")}>
        {status === "uploading" ? <Spinner className="size-3.5" label={`Uploading ${name}`} /> : status === "error" ? <AlertCircleIcon className="size-4" /> : <FileGlyph mime={mime} />}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate font-medium">{name}</span>
        <span className={cn("block text-xs", status === "error" ? "text-danger" : "text-faint")}>
          {status === "uploading" ? "Uploading…" : status === "error" ? error ?? "Upload failed" : formatBytes(size)}
        </span>
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="rounded-md p-0.5 text-faint opacity-70 transition hover:bg-muted hover:text-foreground group-hover/chip:opacity-100"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
