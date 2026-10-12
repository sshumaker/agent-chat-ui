"use client";

import type { ChildActivity, ChildPart } from "../../model";
import { ArrowRightIcon, BanIcon, BotIcon, CheckIcon, CircleHelpIcon, ChevronRightIcon, FileTextIcon, GlobeIcon, MessageSquareTextIcon, SquareTerminalIcon, TriangleAlertIcon, WrenchIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";

import { Markdown } from "../markdown";
import { Spinner } from "../ui/spinner";
import { childHeader, formatCost, formatUsage, humanizeName, modelLabel, CHILD_STATUS_LABEL } from "../../lib/view-model";
import { cn } from "../../lib/utils";

function ActivityGlyph({ status }: { status: string }) {
  if (status === "running" || status === "started") return <Spinner className="size-3" label="In progress" />;
  if (status === "ok" || status === "done") return <CheckIcon className="size-3 text-success" aria-label="Done" />;
  if (status === "error") return <XIcon className="size-3 text-danger" aria-label="Failed" />;
  return <BanIcon className="size-3 text-faint" aria-label={status === "declined" ? "Declined" : "Stopped"} />;
}

/** A message between the main agent and the child, as one line of its log. */
export function childMessageLabel(line: Extract<ChildActivity, { kind: "message" }>, name: string): string {
  const who = humanizeName(name);
  if (line.direction === "to_child")
    return line.message_kind === "answer"
      ? `Parent → ${who} answered: ${line.text}`
      : `Parent → ${who}: ${line.text}${line.message_kind === "steer" ? " (steer)" : ""}`;
  return line.message_kind === "ask" ? `${who} asks: ${line.text}` : `${who}: ${line.text}`;
}

function MessageLine({ line, name }: { line: Extract<ChildActivity, { kind: "message" }>; name: string }) {
  const Icon = line.direction === "to_child" ? ArrowRightIcon : line.message_kind === "ask" ? CircleHelpIcon : MessageSquareTextIcon;
  return (
    <li
      className={cn("flex gap-2 py-0.5 text-[13px]", line.direction === "to_child" ? "text-foreground" : "text-muted-foreground")}
      data-testid="child-activity"
      data-kind="message"
      data-direction={line.direction}
      data-message-kind={line.message_kind}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 line-clamp-3 whitespace-pre-wrap">{childMessageLabel(line, name)}</span>
    </li>
  );
}

function ActivityLine({ line, name }: { line: ChildActivity; name: string }) {
  if (line.kind === "message") return <MessageLine line={line} name={name} />;
  if (line.kind === "text")
    return (
      <li className="flex gap-2 py-0.5 text-[13px] text-muted-foreground" data-testid="child-activity" data-kind="text">
        <MessageSquareTextIcon className="mt-0.5 size-3.5 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 line-clamp-3 whitespace-pre-wrap">{line.text}</span>
      </li>
    );
  const Icon = line.kind === "step" ? SquareTerminalIcon : /web|search|fetch/i.test(line.label) ? GlobeIcon : WrenchIcon;
  const label = line.kind === "step" ? line.title || "Running code" : line.label;
  return (
    <li className="flex items-center gap-2 py-0.5 text-[13px] text-muted-foreground" data-testid="child-activity" data-kind={line.kind} data-status={line.status}>
      <Icon className="size-3.5 shrink-0 text-faint" />
      <span className={cn("min-w-0 flex-1 truncate", (line.status === "running" || line.status === "started") && "text-shimmer")}>{label}</span>
      <ActivityGlyph status={line.status} />
    </li>
  );
}

function StatusBadge({ child }: { child: ChildPart }) {
  switch (child.status) {
    case "running":
      return <Spinner className="size-3.5" label="Subagent working" />;
    case "completed":
      return <CheckIcon className="size-3.5 text-success" aria-label="Done" />;
    case "error":
      return <XIcon className="size-3.5 text-danger" aria-label="Failed" />;
    case "limit":
      return <TriangleAlertIcon className="size-3.5 text-warning" aria-label="Stopped at its limit" />;
    case "stopped":
      return <BanIcon className="size-3.5 text-faint" aria-label="Stopped" />;
  }
}

/**
 * One subagent, as a collapsible group in the turn that started it. Running, it stays
 * open on its latest activity; done, it folds to its header and opens to the task, the
 * activity log and the answer the main agent received.
 */
export function ChildGroup({ child }: { child: ChildPart }) {
  const running = child.status === "running";
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? running;
  const id = useId();
  const latest = child.activity[child.activity.length - 1];
  return (
    <section
      data-testid="child-group"
      data-status={child.status}
      data-name={child.name}
      aria-label={`Subagent ${humanizeName(child.name)}`}
      className={cn("my-2 rounded-xl border bg-surface/60", running ? "border-accent/30" : "border-border")}
    >
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        aria-controls={id}
        className="flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
      >
        <BotIcon className={cn("size-4 shrink-0", running ? "text-accent" : "text-faint")} />
        <span className={cn("min-w-0 flex-1 truncate text-muted-foreground", running && "text-foreground")} data-testid="child-header">
          {childHeader(child)}
        </span>
        {child.usage && !running ? (
          <span className="hidden shrink-0 text-xs text-faint tabular-nums sm:inline" title={formatUsage(child.usage)} data-testid="child-cost">
            {formatCost(child.usage.cost_usd)}
          </span>
        ) : null}
        <StatusBadge child={child} />
        <ChevronRightIcon className={cn("size-3.5 shrink-0 text-faint transition-transform", expanded && "rotate-90")} />
      </button>
      {!expanded && running && latest ? (
        <ul className="px-3 pb-2 pl-9" data-testid="child-latest">
          <ActivityLine line={latest} name={child.name} />
        </ul>
      ) : null}
      {expanded ? (
        <div id={id} className="border-t border-border px-3 py-2 animate-fade-in" data-testid="child-body">
          <div className="mb-2">
            <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Task</div>
            <p className="text-[13px] whitespace-pre-wrap text-muted-foreground line-clamp-6" data-testid="child-prompt">
              {child.prompt}
            </p>
          </div>
          {child.activity.length ? (
            <div className="mb-2">
              <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Activity</div>
              <ul className="border-l border-border pl-2" data-testid="child-activity-log">
                {child.activity.map((a) => (
                  <ActivityLine
                    key={a.kind === "step" ? `s-${a.step_id}` : a.kind === "tool_call" ? `c-${a.call_id}` : a.kind === "message" ? `m-${a.message_id}` : `t-${a.message_id}`}
                    line={a}
                    name={child.name}
                  />
                ))}
              </ul>
            </div>
          ) : running ? (
            <p className="mb-2 flex items-center gap-2 text-[13px] text-muted-foreground">
              <Spinner className="size-3" label="" /> <span className="text-shimmer">Starting…</span>
            </p>
          ) : null}
          {child.reason && child.status !== "completed" ? (
            <p className="mb-2 text-[13px] text-muted-foreground" data-testid="child-reason">
              {humanizeName(child.name)} {CHILD_STATUS_LABEL[child.status]}: {child.reason}
            </p>
          ) : null}
          {child.result ? (
            <div data-testid="child-result">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">
                <FileTextIcon className="size-3" /> Answer · {modelLabel(child.model)}
              </div>
              <Markdown text={child.result} className="text-[14px]" />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
