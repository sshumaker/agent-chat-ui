"use client";

import type { InteractionPart } from "../../model";
import { AlertCircleIcon, CalendarIcon, CheckIcon, ChevronDownIcon, FileIcon, GlobeIcon, MailIcon, ShieldCheckIcon, WrenchIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { useInteraction } from "../../hooks/use-interaction";
import { approvalAnswer, choiceOf, describeAction, describeResolution, type ApprovalChoice } from "../../lib/interactions";
import { cn } from "../../lib/utils";
import { humanizeName } from "../../lib/view-model";

import { useChatActions } from "./chat-context";

const ICONS = { mail: MailIcon, calendar: CalendarIcon, file: FileIcon, globe: GlobeIcon, tool: WrenchIcon };

export function ApprovalCard({ part }: { part: InteractionPart }) {
  const { answer } = useChatActions();
  const { state, send } = useInteraction(part, answer);
  const desc = describeAction(part.action);
  const Icon = ICONS[desc?.icon ?? "tool"];
  const [showDetails, setShowDetails] = useState(false);

  const resolved = state.status === "resolved";
  const submitting = state.status === "submitting";
  const chosen = state.status === "submitting" || state.status === "resolved" ? choiceOf(state.answer) : null;
  const approved = resolved && state.answer.kind === "approve" && state.answer.approved && state.by === "user";
  const fieldsVisible = !resolved || showDetails;

  const choose = (c: ApprovalChoice) => void send(approvalAnswer(c));

  return (
    <section
      role="group"
      aria-label={`Approval request: ${desc?.verb ?? part.title}`}
      data-testid="approval-card"
      data-state={state.status}
      className={cn(
        "my-3 overflow-hidden rounded-2xl border bg-surface shadow-card transition-colors animate-rise",
        resolved ? "border-border" : "border-accent/40 ring-4 ring-accent-soft",
      )}
    >
      <header className="flex items-start gap-3 px-4 pt-4 pb-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", resolved ? "bg-muted text-muted-foreground" : "bg-accent-soft text-accent")}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold">{desc?.verb ?? part.title}</h3>
            {!resolved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                <ShieldCheckIcon className="size-3" /> Needs your approval
              </span>
            ) : null}
          </div>
          {desc?.target ? <p className="mt-0.5 truncate text-sm text-muted-foreground">{desc.target}</p> : null}
          {part.child_name ? (
            <p className="mt-0.5 text-xs text-faint" data-testid="interaction-from-child">
              Requested by subagent {humanizeName(part.child_name)}
            </p>
          ) : null}
          {part.body && !resolved ? <p className="mt-1 text-sm text-muted-foreground">{part.body}</p> : null}
        </div>
      </header>

      {desc && desc.fields.length > 0 && fieldsVisible ? (
        <dl className="mx-4 mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-surface-2 px-3.5 py-3 text-sm">
          {desc.fields.map((f) => (
            <div key={f.label} className="contents">
              <dt className="pt-px text-muted-foreground">{f.label}</dt>
              <dd className={cn("min-w-0 break-words", f.multiline && "max-h-48 overflow-auto whitespace-pre-wrap scrollbar-thin")}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {resolved ? (
        <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className={cn("flex items-center gap-1.5 text-sm font-medium", approved ? "text-success" : "text-muted-foreground")} data-testid="approval-resolution">
            {approved ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}
            {describeResolution(state.answer, state.by, part)}
          </p>
          {desc && desc.fields.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Details <ChevronDownIcon className={cn("size-3.5 transition-transform", showDetails && "rotate-180")} />
            </button>
          ) : null}
        </footer>
      ) : (
        <footer className="border-t border-border px-4 py-3">
          {state.status === "pending" && state.error ? (
            <p role="alert" className="mb-2.5 flex items-center gap-1.5 text-sm text-danger">
              <AlertCircleIcon className="size-4 shrink-0" /> Couldn&apos;t send your answer — {state.error}. Try again.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => choose("once")} disabled={submitting} aria-busy={submitting && chosen === "once"}>
              {submitting && chosen === "once" ? <Spinner className="text-primary-foreground" decorative /> : <CheckIcon />}
              Allow once
            </Button>
            <Button size="sm" variant="outline" onClick={() => choose("always")} disabled={submitting} aria-busy={submitting && chosen === "always"}>
              {submitting && chosen === "always" ? <Spinner decorative /> : null}
              Always allow in this chat
            </Button>
            <Button size="sm" variant="ghost" onClick={() => choose("deny")} disabled={submitting} aria-busy={submitting && chosen === "deny"} className="sm:ml-auto">
              {submitting && chosen === "deny" ? <Spinner decorative /> : <XIcon />}
              Deny
            </Button>
          </div>
          {desc ? <p className="mt-2.5 font-mono text-[11px] text-faint">{desc.technical}</p> : null}
        </footer>
      )}
    </section>
  );
}
