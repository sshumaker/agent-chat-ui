"use client";

import type { ArtifactInfo, AssistantTurn, Attachment, Transcript } from "../../model";
import { AlertTriangleIcon, CheckIcon, CopyIcon, CornerDownRightIcon, FileTextIcon, ImageIcon, InfoIcon, RotateCcwIcon, SquareIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { AgentAvatar } from "../branding";
import { Markdown } from "../markdown";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip } from "../ui/tooltip";
import { useChatBranding } from "../branding";
import { artifactLabel, artifactView, errorCopy, formatBytes, formatUsage, STATUS_LABEL, isActivity, runningChildren, runStepCount, stepSummary, summarizeRun, toBlocks, turnText, type Block } from "../../lib/view-model";
import { cn } from "../../lib/utils";

import { ActivitySummary, StepImages, StepRow, ThinkingRow, ToolRow } from "./activity";
import { ApprovalCard } from "./approval-card";
import { AttachmentChip } from "./attachment-chip";
import { ChildGroup } from "./child-group";
import { useChatActions } from "./chat-context";
import { QuestionCard } from "./question-card";

export function UserMessage({
  text,
  attachments,
  pending,
  failed,
  onRetry,
}: {
  text: string;
  attachments: Attachment[];
  pending?: boolean;
  failed?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-end gap-1.5 animate-rise" data-testid="user-message" data-pending={pending ? "true" : undefined}>
      {attachments.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {attachments.map((a) => (
            <AttachmentChip key={a.id} name={a.name} mime={a.mime} size={a.size} />
          ))}
        </div>
      ) : null}
      {text ? (
        <div className={cn("max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words", pending && "opacity-70")}>
          {text}
        </div>
      ) : null}
      {failed ? (
        <p className="flex items-center gap-2 text-xs text-danger" role="alert">
          <AlertTriangleIcon className="size-3.5" /> Not sent — {failed}
          {onRetry ? (
            <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function ArtifactCard({ artifact, artifactId }: { artifact?: ArtifactInfo; artifactId: string }) {
  const { openArtifact } = useChatActions();
  if (!artifact) return null;
  const { view } = artifactView(artifact.mime, artifact.name);
  const Icon = view === "image" ? ImageIcon : FileTextIcon;
  return (
    <button
      type="button"
      onClick={() => openArtifact(artifactId)}
      data-testid="artifact-card"
      className="group my-2 flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left shadow-card transition-colors hover:border-accent/50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{artifactLabel(artifact)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {artifact.title ? `${artifact.name} · ` : ""}
          {formatBytes(artifact.size)}
          {artifact.version > 1 ? ` · v${artifact.version}` : ""}
        </span>
      </span>
      <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-accent-foreground">Open</span>
    </button>
  );
}

function ErrorBlock({ message, retryable, code }: { message: string; retryable: boolean; code: string }) {
  const { retry } = useChatActions();
  const copy = errorCopy(code, message);
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div role="alert" data-testid="turn-error" className="my-2 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-sm">
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">Something went wrong</p>
        <p className="mt-0.5 text-muted-foreground">{copy.body}</p>
        {copy.detail ? (
          <button type="button" onClick={() => setShowDetail((v) => !v)} aria-expanded={showDetail} className="mt-1 text-xs text-faint underline-offset-2 hover:underline">
            {showDetail ? "Hide details" : "Details"}
          </button>
        ) : null}
        {showDetail && copy.detail ? <p className="mt-1 font-mono text-[11px] break-words text-faint" data-testid="turn-error-detail">{copy.detail}</p> : null}
      </div>
      {retryable ? (
        <Button size="sm" variant="outline" onClick={retry}>
          <RotateCcwIcon /> Retry
        </Button>
      ) : null}
    </div>
  );
}

function renderBlock(b: Block | { kind: "note"; key: string; text: string }) {
  switch (b.kind) {
    case "text":
      return b.text ? <Markdown key={b.key} text={b.text} streaming={b.streaming} className="my-1" /> : null;
    case "note":
      return (
        <p key={b.key} data-testid="interim-note" className="px-2 py-1 text-sm text-muted-foreground">
          {b.text}
        </p>
      );
    case "thinking":
      return <ThinkingRow key={b.key} text={b.text} active={b.active} />;
    case "step":
      return <StepRow key={b.key} step={b.step} steps={b.steps} calls={b.calls} />;
    case "tool":
      return <ToolRow key={b.key} call={b.call} />;
    case "interaction":
      return b.interaction.kind === "approve" ? <ApprovalCard key={b.key} part={b.interaction} /> : <QuestionCard key={b.key} part={b.interaction} />;
    case "artifact":
      return <ArtifactCard key={b.key} artifact={b.artifact} artifactId={b.artifactId} />;
    case "child":
      return <ChildGroup key={b.key} child={b.child} />;
    case "error":
      return <ErrorBlock key={b.key} message={b.message} retryable={b.retryable} code={b.code} />;
  }
}

type Run = { kind: "run"; key: string; blocks: Block[] };

/** Past this a remark between steps is substance, not narration, and stays in the thread. */
const INTERIM_MAX = 400;

/**
 * Consecutive activity rows share one quiet container; everything else stands alone. A short
 * remark between steps ("Got 7 good sources, checking two more") joins the run as a note, so
 * a long task reads as one log rather than a stack of small ones.
 */
function groupRuns(blocks: Block[]): (Block | Run)[] {
  const out: (Block | Run)[] = [];
  const activityAfter = blocks.map((_, i) => blocks.slice(i + 1).some(isActivity));
  for (const [i, b] of blocks.entries()) {
    const last = out[out.length - 1];
    const interim = b.kind === "text" && !b.streaming && b.text.length < INTERIM_MAX && activityAfter[i];
    if (isActivity(b) || interim) {
      if (last && last.kind === "run") last.blocks.push(b);
      else out.push({ kind: "run", key: `run-${b.key}`, blocks: [b] });
    } else out.push(b);
  }
  return out;
}

const isLive = (b: Block) =>
  (b.kind === "step" && b.step.status === "running") || (b.kind === "tool" && b.call.status === "started") || (b.kind === "thinking" && b.active);

/**
 * Finished activity folds to one line; what is happening now stays in view. A settled run
 * folds whole. A run still going folds only the rows before its live one (or before its
 * latest row, between steps), so a step waiting on an approval is never past-tensed.
 */
function ActivityRun({ run, settled }: { run: Run; settled: boolean }) {
  const liveAt = run.blocks.findIndex(isLive);
  const split = liveAt >= 0 ? liveAt : settled ? run.blocks.length : run.blocks.length - 1;
  const done = run.blocks.slice(0, split);
  const rest = run.blocks.slice(split);
  const inRun = (list: Block[]) => list.map((b) => (b.kind === "text" ? renderBlock({ kind: "note", key: b.key, text: b.text }) : renderBlock(b)));
  const count = runStepCount(done);
  if (count < 2) return <div className="-ml-2 my-1">{run.blocks.map(renderBlock)}</div>;
  const last = [...done].reverse().find((b) => b.kind === "step" || b.kind === "tool");
  const failed = last?.kind === "step" ? last.step.status === "error" : last?.kind === "tool" && last.call.status === "error";
  return (
    <div className="-ml-2 my-1">
      <ActivitySummary
        label={summarizeRun(done)}
        count={count}
        failed={failed}
        images={done.map((b) => (b.kind === "step" ? <StepImages key={b.key} step={b.step} label={stepSummary(b.step)} /> : null))}
      >
        {inRun(done)}
      </ActivitySummary>
      {rest.map(renderBlock)}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied" : "Copy"}>
      <button
        type="button"
        aria-label="Copy reply"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="rounded-md p-1.5 text-faint transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </button>
    </Tooltip>
  );
}

function RetryButton() {
  const { retry } = useChatActions();
  return (
    <Tooltip content="Ask again">
      <button type="button" aria-label="Ask again" onClick={retry} className="rounded-md p-1.5 text-faint transition-colors hover:bg-muted hover:text-foreground" data-testid="regenerate">
        <RotateCcwIcon className="size-3.5" />
      </button>
    </Tooltip>
  );
}

/** Seconds since `iso`, ticking once a second while `active`. */
function useElapsed(iso: string, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
}

/** A new chat's workspace coming up: say so, and past a few seconds say how long it has been. */
function StartingIndicator({ since }: { since: string }) {
  const s = useElapsed(since, true);
  return (
    <div className="py-1" data-testid="working-indicator">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" label={STATUS_LABEL.starting} />
        <span className="text-shimmer">{STATUS_LABEL.starting}</span>
        {s >= 5 ? <span className="text-xs text-faint tabular-nums">{s}s</span> : null}
      </p>
      {s >= 15 ? <p className="mt-1 ml-5.5 text-xs text-faint animate-fade-in">Setting up a fresh workspace can take up to a minute. It&apos;s quick after that.</p> : null}
    </div>
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  turn,
  artifacts,
  isLast,
  starting = false,
}: {
  turn: AssistantTurn;
  artifacts: Transcript["artifacts"];
  isLast: boolean;
  /** The conversation's workspace is still coming up (a new chat's first turn). */
  starting?: boolean;
}) {
  const { agentName } = useChatBranding();
  const blocks = toBlocks(turn, artifacts);
  const running = turn.status === "running";
  const text = turnText(turn);
  const lastBlock = blocks[blocks.length - 1];
  const showWorking = running && (!lastBlock || (lastBlock.kind === "text" && !lastBlock.streaming) || lastBlock.kind === "artifact" || lastBlock.kind === "child");
  const waitingOn = !running && isLast ? runningChildren(turn) : [];
  return (
    <div className="group/turn flex gap-3 animate-rise" data-testid="assistant-message" data-status={turn.status} data-wake={turn.wake ? turn.wake.reason : undefined}>
      <AgentAvatar className="mt-0.5" active={running} />
      <div className="min-w-0 flex-1 pt-0.5">
        {turn.wake ? (
          <p className="mb-1 flex items-center gap-1.5 text-xs text-faint" data-testid="wake-note">
            <CornerDownRightIcon className="size-3" />
            {turn.wake.reason === "deadline"
              ? "Resumed after waiting"
              : turn.wake.reason === "message"
                ? "Resumed after a subagent wrote"
                : turn.wake.reason === "job"
                  ? "Resumed after a background task finished"
                  : "Resumed after subagents finished"}
          </p>
        ) : null}
        {groupRuns(blocks).map((b, i, all) =>
          b.kind === "run" ? <ActivityRun key={b.key} run={b} settled={!running || i < all.length - 1} /> : renderBlock(b),
        )}
        {showWorking && starting ? <StartingIndicator since={turn.ts} /> : null}
        {showWorking && !starting ? (
          <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground" data-testid="working-indicator">
            <Spinner className="size-3.5" label={`${agentName} is working`} />
            <span className="text-shimmer">{blocks.length ? "Working…" : "Thinking…"}</span>
          </p>
        ) : null}
        {waitingOn.length ? (
          <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground" data-testid="waiting-on-children">
            <Spinner className="size-3.5" label="Waiting for subagents" />
            <span className="text-shimmer">
              Waiting for {waitingOn.length === 1 ? "1 subagent" : `${waitingOn.length} subagents`}…
            </span>
          </p>
        ) : null}
        {turn.status === "stopped" ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-faint" data-testid="stopped-note">
            <SquareIcon className="size-3" /> Stopped
          </p>
        ) : null}
        {!running && (text || turn.usage) ? (
          <div className={cn("mt-1 -ml-1.5 flex items-center gap-0.5 transition-opacity", isLast ? "opacity-100" : "opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100")}>
            {text ? <CopyButton text={text} /> : null}
            {isLast && turn.status !== "error" ? <RetryButton /> : null}
            {turn.usage ? (
              <Tooltip content={formatUsage(turn.usage)}>
                <button type="button" aria-label={`Usage: ${formatUsage(turn.usage)}`} className="rounded-md p-1.5 text-faint transition-colors hover:bg-muted hover:text-foreground" data-testid="usage">
                  <InfoIcon className="size-3.5" />
                </button>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
