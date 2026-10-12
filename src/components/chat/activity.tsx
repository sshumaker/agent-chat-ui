"use client";

import type { StepPart, ToolCallPart } from "../../model";
import {
  BanIcon,
  BrainIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  GlobeIcon,
  HardDriveIcon,
  ListChecksIcon,
  MailIcon,
  SquareTerminalIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useState } from "react";

import { CodeBlock } from "../markdown";
import { Spinner } from "../ui/spinner";
import { stepSummary, toolStatusLabel } from "../../lib/view-model";
import { cn } from "../../lib/utils";

function toolIcon(call: ToolCallPart) {
  const k = `${call.server} ${call.tool}`.toLowerCase();
  if (/gmail|mail/.test(k)) return MailIcon;
  if (/calendar/.test(k)) return CalendarIcon;
  if (/drive/.test(k)) return HardDriveIcon;
  if (/web|search|fetch|http/.test(k)) return GlobeIcon;
  return WrenchIcon;
}

function StatusGlyph({ status }: { status: "running" | "started" | "ok" | "done" | "error" | "aborted" | "declined" }) {
  switch (status) {
    case "running":
    case "started":
      return <Spinner className="size-3.5" label="In progress" />;
    case "ok":
    case "done":
      return <CheckIcon className="size-3.5 text-success" aria-label="Done" />;
    case "error":
      return <XIcon className="size-3.5 text-danger" aria-label="Failed" />;
    case "aborted":
      return <BanIcon className="size-3.5 text-faint" aria-label="Stopped" />;
    case "declined":
      return <BanIcon className="size-3.5 text-warning" aria-label="Declined" />;
  }
}

/** Seconds this row has been running, shown once it passes a few; counted from when it appeared. */
function RunningClock({ after = 8 }: { after?: number }) {
  const [since] = useState(() => Date.now());
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS(Math.floor((Date.now() - since) / 1000)), 1000);
    return () => clearInterval(t);
  }, [since]);
  return s >= after ? <span className="shrink-0 text-xs text-faint tabular-nums" data-testid="running-clock">{s}s</span> : null;
}

/** A disclosure row: icon, label, status, and a body revealed on click. */
function Row({
  icon: Icon,
  label,
  status,
  children,
  testId,
  defaultOpen = false,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: React.ReactNode;
  status: React.ComponentProps<typeof StatusGlyph>["status"];
  children?: React.ReactNode;
  testId?: string;
  defaultOpen?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const expandable = Boolean(children);
  const running = status === "running" || status === "started";
  return (
    <div data-testid={testId} data-status={status} className="group/row">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? id : undefined}
        disabled={!expandable}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors",
          expandable && "hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0 text-faint" />
        <span className={cn("min-w-0 flex-1 truncate", running && "text-shimmer")}>{label}</span>
        {hint ? <span className="hidden shrink-0 text-xs text-faint sm:inline">{hint}</span> : null}
        {running ? <RunningClock /> : null}
        <StatusGlyph status={status} />
        {expandable ? <ChevronRightIcon className={cn("size-3.5 shrink-0 text-faint transition-transform", open && "rotate-90")} /> : null}
      </button>
      {expandable && open ? (
        <div id={id} className="mt-1 mb-2 ml-8 animate-fade-in">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function Pre({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <pre
      className={cn(
        "max-h-64 overflow-auto rounded-lg border border-border bg-code px-3 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap scrollbar-thin",
        tone === "error" && "border-danger/30 text-danger",
      )}
    >
      {children}
    </pre>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">{label}</div>
      {children}
    </div>
  );
}

export function ToolRow({ call, nested }: { call: ToolCallPart; nested?: boolean }) {
  const hasBody = Boolean(call.args_preview || call.result_preview);
  return (
    <Row
      icon={toolIcon(call)}
      label={call.label}
      status={call.status}
      testId="tool-row"
      hint={call.status === "declined" ? toolStatusLabel(call) : undefined}
    >
      {hasBody ? (
        <div className={cn(nested && "text-[13px]")}>
          {call.args_preview ? (
            <Labelled label="Input">
              <Pre>{call.args_preview}</Pre>
            </Labelled>
          ) : null}
          {call.result_preview ? (
            <Labelled label="Result">
              <Pre>{call.result_preview}</Pre>
            </Labelled>
          ) : null}
        </div>
      ) : null}
    </Row>
  );
}

function StepBody({ step, of }: { step: StepPart; of?: string }) {
  const out = [step.stdout, step.stderr].some(Boolean) ? null : step.output;
  const suffix = of ? ` (${of})` : "";
  return (
    <div className="mb-3 last:mb-0">
      {step.code ? (
        <Labelled label={`Code${suffix}`}>
          <CodeBlock code={step.code} language={step.kind === "code" ? "python" : "text"} />
        </Labelled>
      ) : null}
      {step.stdout ? (
        <Labelled label="Output">
          <Pre>{step.stdout}</Pre>
        </Labelled>
      ) : null}
      {out ? (
        <Labelled label="Output">
          <Pre>{out}</Pre>
        </Labelled>
      ) : null}
      {step.stderr ? (
        <Labelled label="Errors">
          <Pre tone="error">{step.stderr}</Pre>
        </Labelled>
      ) : null}
      {step.error && !step.stderr?.includes(step.error) ? (
        <Labelled label="Error">
          <Pre tone="error">{step.error}</Pre>
        </Labelled>
      ) : null}
    </div>
  );
}

const hasBody = (s: StepPart) => Boolean(s.code || s.stdout || s.stderr || s.output || s.error);

export function StepImages({ step, label }: { step: StepPart; label: string }) {
  if (step.images.length === 0) return null;
  return (
    <div className="mt-1 mb-2 ml-8 flex flex-wrap gap-2">
      {step.images.map((img, i) => (
        <img
          key={i}
          src={`data:${img.mime};base64,${img.data_base64}`}
          alt={`Output ${i + 1} of ${label}`}
          className="max-h-96 max-w-full rounded-xl border border-border bg-white"
        />
      ))}
    </div>
  );
}

/** One activity row for a code or file step; `steps` are the cells merged into it (same title, in a row). */
export function StepRow({ step, steps = [step], calls }: { step: StepPart; steps?: StepPart[]; calls: ToolCallPart[] }) {
  const withBody = steps.filter(hasBody);
  const label = stepSummary(step);
  return (
    <div data-testid="step" data-status={step.status}>
      <Row icon={step.kind === "code" ? SquareTerminalIcon : FileTextIcon} label={label} status={step.status} testId="step-row">
        {withBody.length > 0 ? (
          <div>
            {withBody.map((s, i) => (
              <StepBody key={s.step_id} step={s} of={withBody.length > 1 ? `${i + 1} of ${withBody.length}` : undefined} />
            ))}
          </div>
        ) : null}
      </Row>
      {calls.length > 0 ? (
        <div className="ml-4 border-l border-border pl-2">
          {calls.map((c) => (
            <ToolRow key={c.call_id} call={c} nested />
          ))}
        </div>
      ) : null}
      <StepImages step={step} label={label} />
    </div>
  );
}

/**
 * A finished run of activity rows, folded into one line ("Searched the web and read 6 web
 * pages · 5 steps"). The rows are one click away; images the steps made stay in view.
 */
export function ActivitySummary({ label, count, failed, children, images }: { label: string; count: number; failed: boolean; children: React.ReactNode; images: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div data-testid="activity-summary" data-open={open ? "true" : undefined}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ListChecksIcon className="size-4 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-xs text-faint">
          {count} steps
        </span>
        <StatusGlyph status={failed ? "error" : "ok"} />
        <ChevronRightIcon className={cn("size-3.5 shrink-0 text-faint transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <div id={id} className="mt-0.5 ml-4 border-l border-border pl-2 animate-fade-in">
          {children}
        </div>
      ) : (
        images
      )}
    </div>
  );
}

export function ThinkingRow({ text, active }: { text: string; active: boolean }) {
  if (!text)
    return (
      <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground" data-testid="thinking-indicator">
        <BrainIcon className="size-3.5 shrink-0 text-faint" aria-hidden />
        <span className="text-shimmer">Thinking…</span>
      </p>
    );
  return (
    <Row icon={BrainIcon} label={active ? "Thinking…" : "Thought process"} status={active ? "running" : "ok"} testId="thinking-row">
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground italic">{text}</p>
    </Row>
  );
}
