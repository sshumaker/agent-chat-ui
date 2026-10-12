"use client";

import type { Attachment } from "../../model";
import { ArrowUpIcon, Clock3Icon, PaperclipIcon, SquareIcon } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

import { Tooltip } from "../ui/tooltip";
import { useChatBranding } from "../branding";
import type { Outgoing } from "../../lib/outgoing";
import { cn } from "../../lib/utils";

import { AttachmentChip, type ChipStatus } from "./attachment-chip";

interface Chip {
  key: string;
  name: string;
  mime: string;
  size: number;
  status: ChipStatus;
  attachment?: Attachment;
  error?: string;
}

export interface ComposerHandle {
  addFiles: (files: File[]) => void;
  focus: () => void;
  setText: (text: string) => void;
}

export interface ComposerProps {
  /** The agent owns the turn: a send is queued, and Stop is offered. */
  busy: boolean;
  onStop?: () => void;
  stopping?: boolean;
  onSubmit: (text: string, attachments: Attachment[]) => void;
  upload?: (file: File) => Promise<Attachment>;
  queued?: Outgoing[];
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  /** The user is here to write: the composer took focus or its text changed. */
  onActivity?: () => void;
}

let chipSeq = 0;
const MAX_HEIGHT = 240;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { busy, onStop, stopping, onSubmit, upload, queued = [], placeholder, autoFocus, disabled, className, onActivity },
  ref,
) {
  const { agentName } = useChatBranding();
  const [text, setText] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);

  const addFiles = useCallback(
    (files: File[]) => {
      if (!upload || disabled) return;
      for (const file of files) {
        const key = `chip-${++chipSeq}`;
        setChips((cs) => [...cs, { key, name: file.name || "pasted file", mime: file.type || "application/octet-stream", size: file.size, status: "uploading" }]);
        upload(file).then(
          (attachment) => setChips((cs) => cs.map((c) => (c.key === key ? { ...c, status: "ready", attachment } : c))),
          (e: Error) => setChips((cs) => cs.map((c) => (c.key === key ? { ...c, status: "error", error: e.message || "Upload failed" } : c))),
        );
      }
    },
    [upload, disabled],
  );

  useImperativeHandle(ref, () => ({
    addFiles,
    focus: () => textareaRef.current?.focus(),
    setText: (t: string) => {
      setText(t);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  }));

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const uploading = chips.some((c) => c.status === "uploading");
  const ready = chips.filter((c) => c.status === "ready" && c.attachment).map((c) => c.attachment!);
  const canSend = !disabled && !uploading && (text.trim().length > 0 || ready.length > 0);

  const submit = () => {
    if (!canSend) return;
    onSubmit(text.trim(), ready);
    setText("");
    setChips((cs) => cs.filter((c) => c.status === "error"));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !composing.current && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return;
    if (!e.clipboardData.getData("text/plain")) e.preventDefault();
    addFiles(files);
  };

  const showStop = busy && Boolean(onStop);
  const sendLabel = busy ? "Queue message" : "Send message";

  return (
    <div className={cn("w-full", className)}>
      {queued.length > 0 ? (
        <ul className="mx-3 mb-[-1px] flex flex-col gap-1 rounded-t-xl border border-b-0 border-border bg-surface-2 px-3 py-2" aria-label="Queued messages" data-testid="queued-tray">
          {queued.map((q) => (
            <li key={q.cid} className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="queued-message">
              <Clock3Icon className="size-3.5 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-foreground">{q.text || `${q.attachments.length} attachment(s)`}</span>
              <span className="shrink-0 text-xs text-faint">Queued · sends when {agentName} finishes</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div
        className={cn(
          "rounded-2xl border border-border-strong bg-surface shadow-card transition-[border-color,box-shadow] focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent-soft",
          disabled && "opacity-60",
        )}
      >
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-3 pt-3" aria-label="Attachments">
            {chips.map((c) => (
              <AttachmentChip
                key={c.key}
                name={c.name}
                mime={c.mime}
                size={c.size}
                status={c.status}
                error={c.error}
                onRemove={() => setChips((cs) => cs.filter((x) => x.key !== c.key))}
              />
            ))}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onActivity?.();
          }}
          onFocus={onActivity}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          rows={1}
          disabled={disabled}
          placeholder={placeholder ?? (busy ? `Add a follow-up — it will send when ${agentName} finishes` : `Message ${agentName}…`)}
          aria-label="Message"
          className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-faint focus-visible:outline-none scrollbar-thin"
        />
        <div className="flex items-center gap-1 px-2.5 pt-1 pb-2.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            data-testid="file-input"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          {upload ? <Tooltip content="Attach files">
            <button
              type="button"
              aria-label="Attach files"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PaperclipIcon className="size-4" />
            </button>
          </Tooltip> : null}
          <span className="ml-1 hidden text-xs text-faint sm:inline">{uploading ? "Uploading…" : ""}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {showStop ? (
              <Tooltip content="Stop">
                <button
                  type="button"
                  aria-label="Stop"
                  onClick={onStop}
                  disabled={stopping}
                  data-testid="stop-button"
                  className="flex size-8 items-center justify-center rounded-lg border border-border-strong bg-surface text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <SquareIcon className="size-3 fill-current" />
                </button>
              </Tooltip>
            ) : null}
            {!showStop || text.trim() || ready.length ? (
              <Tooltip content={uploading ? "Waiting for uploads" : sendLabel}>
                <button
                  type="button"
                  aria-label={sendLabel}
                  onClick={submit}
                  disabled={!canSend}
                  data-testid="send-button"
                  className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  <ArrowUpIcon className="size-4" strokeWidth={2.4} />
                </button>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});
