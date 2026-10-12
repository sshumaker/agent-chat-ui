import type {
  ArtifactInfo,
  AssistantPart,
  AssistantTurn,
  ChildPart,
  ConversationState,
  InteractionPart,
  StepPart,
  ToolCallPart,
  Transcript,
  Usage,
} from "../model";

import type { StreamStatus } from "../adapter";

/* ------------------------------------------------------------------ blocks */

export type Block =
  | { kind: "text"; key: string; text: string; streaming: boolean }
  | { kind: "thinking"; key: string; text: string; active: boolean }
  /** `step` is the row as shown; `steps` are the cells merged into it (consecutive, same title). */
  | { kind: "step"; key: string; step: StepPart; steps: StepPart[]; calls: ToolCallPart[] }
  | { kind: "tool"; key: string; call: ToolCallPart }
  | { kind: "interaction"; key: string; interaction: InteractionPart }
  | { kind: "artifact"; key: string; artifact: ArtifactInfo | undefined; artifactId: string }
  | { kind: "child"; key: string; child: ChildPart }
  | { kind: "error"; key: string; code: string; message: string; retryable: boolean };

function mergedStatus(steps: StepPart[]): StepPart["status"] {
  if (steps.some((s) => s.status === "running")) return "running";
  return steps[steps.length - 1]!.status;
}

/** Consecutive cells with the same title read as one activity ("Writing the brief", not three of them). */
function mergeInto(prev: Extract<Block, { kind: "step" }>, step: StepPart, calls: ToolCallPart[]): void {
  prev.steps.push(step);
  prev.calls.push(...calls);
  prev.step = { ...step, status: mergedStatus(prev.steps), images: prev.steps.flatMap((s) => s.images) };
}

/**
 * The assistant turn as render blocks, in order. Tool calls that belong to a code step
 * nest under it (they are what that code did); the rest stand alone as activity rows.
 * A thinking block is "active" only while it is the last thing the running turn produced.
 */
export function toBlocks(turn: AssistantTurn, artifacts: Record<string, ArtifactInfo> = {}): Block[] {
  const stepIds = new Set(turn.parts.filter((p): p is StepPart => p.type === "step").map((p) => p.step_id));
  const nested = new Map<string, ToolCallPart[]>();
  for (const p of turn.parts) {
    if (p.type === "tool_call" && p.step_id && stepIds.has(p.step_id)) {
      const list = nested.get(p.step_id) ?? [];
      list.push(p);
      nested.set(p.step_id, list);
    }
  }
  const showsImages = turn.parts.some((p) => p.type === "step" && p.images.length > 0);
  const out: Block[] = [];
  turn.parts.forEach((p, i) => {
    if (p.type === "step") {
      const all = nested.get(p.step_id) ?? [];

      const calls = all;
      const prev = out[out.length - 1];
      if (prev?.kind === "step" && prev.step.title && prev.step.title === p.title) return mergeInto(prev, p, calls);
      out.push({ kind: "step", key: `step-${p.step_id}`, step: p, steps: [p], calls });
      return;
    }
    // A saved copy of a chart the turn already shows inline needs no second card; it is in Documents.
    if (p.type === "artifact" && showsImages && artifacts[p.artifact_id]?.mime.startsWith("image/")) return;
    const b = partToBlock(p, i, turn, stepIds, artifacts);
    if (b) out.push(b);
  });
  return out;
}

function partToBlock(
  p: Exclude<AssistantPart, StepPart>,
  i: number,
  turn: AssistantTurn,
  stepIds: Set<string>,
  artifacts: Record<string, ArtifactInfo>,
): Block | null {
  switch (p.type) {
    case "text":
      return { kind: "text", key: `text-${p.message_id}`, text: p.text, streaming: p.streaming };
    case "thinking": {
      const active = turn.status === "running" && i === turn.parts.length - 1;
      // Thinking with nothing to show (display omitted) is a live indicator, then nothing.
      if (!p.text && !active) return null;
      return { kind: "thinking", key: `thinking-${p.message_id}`, text: p.text, active };
    }
    case "tool_call":
      if (p.step_id && stepIds.has(p.step_id)) return null;
      return { kind: "tool", key: `tool-${p.call_id}`, call: p };
    case "interaction":
      return { kind: "interaction", key: `interaction-${p.interaction_id}`, interaction: p };
    case "artifact":
      return { kind: "artifact", key: `artifact-${p.artifact_id}`, artifact: artifacts[p.artifact_id], artifactId: p.artifact_id };
    case "child":
      return { kind: "child", key: `child-${p.child_id}`, child: p };
    case "error":
      return { kind: "error", key: `error-${i}`, code: p.code, message: p.message, retryable: p.retryable };
  }
}

/* ------------------------------------------------------------------ subagents */

/** "competitor-a" -> "Competitor A"; the agent's handle, read as a name. */
export function humanizeName(name: string): string {
  const words = name
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return name;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** "anthropic/claude-haiku-4-5" -> "haiku-4.5", "anthropic/claude-sonnet-5" -> "sonnet-5". */
export function modelLabel(model: string): string {
  const id = (model.split("/").pop() ?? model).replace(/^claude-/, "");
  const m = /^([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?$/.exec(id);
  if (!m) return id;
  return m[3] ? `${m[1]}-${m[2]}.${m[3]}` : `${m[1]}-${m[2]}`;
}

export const CHILD_STATUS_LABEL: Record<ChildPart["status"], string> = {
  running: "working",
  completed: "done",
  error: "failed",
  stopped: "stopped",
  limit: "stopped at its limit",
};

/** The group's one-line header: "Subagent · Competitor A · haiku-4.5 · 6 steps · done". */
export function childHeader(c: ChildPart): string {
  const steps = `${c.steps} ${c.steps === 1 ? "step" : "steps"}`;
  return ["Subagent", humanizeName(c.name), modelLabel(c.model), steps, CHILD_STATUS_LABEL[c.status]].join(" · ");
}

/** Children in this turn still running (the agent may be waiting on them after its turn ended). */
export function runningChildren(turn: AssistantTurn): ChildPart[] {
  return turn.parts.filter((p): p is ChildPart => p.type === "child" && p.status === "running");
}

/* ------------------------------------------------------------------ activity runs */

const PAST: [RegExp, string][] = [
  [/^Searching\b/, "Searched"],
  [/^Reading\b/, "Read"],
  [/^Plotting\b/, "Plotted"],
  [/^Writing\b/, "Wrote"],
  [/^Analy([sz])ing\b/, "Analy$1ed"],
  [/^Looking\b/, "Looked"],
  [/^Checking\b/, "Checked"],
  [/^Calculating\b/, "Calculated"],
  [/^Reviewing\b/, "Reviewed"],
  [/^Sharing\b/, "Shared"],
  [/^Getting set up\b/, "Got set up"],
  [/^Sending\b/, "Sent"],
  [/^Drafting\b/, "Drafted"],
  [/^Adding\b/, "Added"],
  [/^Finding\b/, "Found"],
  [/^Asking\b/, "Asked"],
  [/^Running\b/, "Ran"],
  [/^Using\b/, "Used"],
  [/^Editing\b/, "Edited"],
  [/^Loading\b/, "Loaded"],
  [/^Comparing\b/, "Compared"],
  [/^Computing\b/, "Computed"],
  [/^Building\b/, "Built"],
  [/^Making\b/, "Made"],
  [/^Summari([sz])ing\b/, "Summari$1ed"],
  [/^Pulling\b/, "Pulled"],
  [/^Fetching\b/, "Fetched"],
  [/^Gathering\b/, "Gathered"],
  [/^Creating\b/, "Created"],
  [/^Preparing\b/, "Prepared"],
  [/^Saving\b/, "Saved"],
  [/^Charting\b/, "Charted"],
  [/^Working out\b/, "Worked out"],
  [/^Thinking\b/, "Thought"],
];

/** "Searching the web" -> "Searched the web", for a finished activity. Unknown verbs are left alone. */
export function pastTense(title: string): string {
  for (const [re, past] of PAST) if (re.test(title)) return title.replace(re, past);
  return title;
}

/** Rows that are how the work got done rather than what was done: left out of a run's summary. */
const LOW_SIGNAL =
  /^(Looking up available tools|Looking at the files|Getting set up|Reviewing the results|Running code|Ran code|Read files|Reading files)$|\b(skill|instructions|available (\w+ )?tools|api docs)\b/i;

/** Past this, a two-activity summary reads as a run-on; show just the first. */
const SUMMARY_MAX = 64;

type ActivityBlock = Extract<Block, { kind: "thinking" | "step" | "tool" }>;

export function isActivity(b: Block): b is ActivityBlock {
  return b.kind === "thinking" || b.kind === "step" || b.kind === "tool";
}

/** How many rows a run counts as, for its "N steps" hint: thinking is not a step. */
export function runStepCount(blocks: Block[]): number {
  return blocks.filter((b) => b.kind === "step" || b.kind === "tool").length;
}

/**
 * One line for a finished run of activity rows: its two most telling activities, past tense
 * ("Searched the web and read 6 web pages"), and how many more there were.
 */
export function summarizeRun(blocks: Block[]): string {
  const titles: string[] = [];
  const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  for (const b of blocks) {
    if (b.kind === "step" && b.step.status === "error") continue;
    const declined = b.kind === "step" ? b.calls.find((c) => c.status === "declined") : b.kind === "tool" && b.call.status === "declined" ? b.call : undefined;
    const t = declined ? `Didn't ${lowerFirst(declined.label)}` : b.kind === "step" ? stepSummary(b.step) : b.kind === "tool" ? b.call.label : undefined;
    if (t && !titles.includes(t)) titles.push(t);
  }
  const telling = titles.filter((t) => !LOW_SIGNAL.test(t));
  const pick = (telling.length > 0 ? telling : titles.slice(0, 1)).map(pastTense);
  if (pick.length === 0) return "Thought it through";
  const [a, b] = pick;
  const lower = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
  const both = b ? `${a} and ${lower(b)}` : a!;
  const head = both.length <= SUMMARY_MAX ? both : a!;
  const more = pick.length - (head === both && b ? 2 : 1);
  return more > 0 ? `${head}, and ${more} more` : head;
}

/** The whole reply as plain text, for the copy button. */
export function turnText(turn: AssistantTurn): string {
  return turn.parts
    .filter((p): p is Extract<AssistantPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim();
}

/* ------------------------------------------------------------------ status */

export type ThreadStatus = "idle" | "starting" | "working" | "waiting" | "reconnecting";

/**
 * What the header and composer should say. Reconnecting wins (the rest may be stale),
 * then a pending interaction ("waiting for you") beats the coarse gateway state.
 */
export function threadStatus(t: Pick<Transcript, "state" | "pending_interactions" | "items">, stream: StreamStatus | null): ThreadStatus {
  if (stream === "reconnecting") return "reconnecting";
  if (t.pending_interactions.length > 0 || t.state === "waiting_for_user") return "waiting";
  if (t.state === "starting") return "starting";
  if (t.state === "working") return "working";
  const last = t.items[t.items.length - 1];
  if (last?.role === "assistant" && last.status === "running") return "working";
  return "idle";
}

/** True while the agent owns the turn: sending now queues, and Stop is offered. */
export function isBusy(status: ThreadStatus | ConversationState): boolean {
  return status === "working" || status === "starting" || status === "waiting" || status === "waiting_for_user";
}

export const STATUS_LABEL: Record<ThreadStatus, string> = {
  idle: "",
  starting: "Starting workspace…",
  working: "Working…",
  waiting: "Waiting for you",
  reconnecting: "Reconnecting…",
};

/* ------------------------------------------------------------------ errors */

const LOOKS_TECHNICAL = /[{}<>]|\bat \w+ \(|Traceback|\/(Users|home|tmp|data)\/|\b(errno|stderr|signal)\b|\bE[A-Z]{4,}\b|\bcode \d+/;

/**
 * What a turn error says to a person. The host's message can be a provider's JSON or a
 * process's stderr; that stays one click away (`detail`), and the card says what happened
 * and what to do.
 */
export function errorCopy(code: string, message: string): { body: string; detail?: string } {
  const detail = `${code}: ${message}`;
  const busy = /overload|rate.?limit|429|529|capacity|too many requests/i.test(`${code} ${message}`);
  if (busy) return { body: "The model is busy right now. Try again in a moment.", detail };
  switch (code) {
    case "agent_exited":
      return { body: "The assistant stopped unexpectedly. Your conversation is saved; try again.", detail };
    case "agent_unavailable":
      return { body: "The workspace couldn't start. Try again in a moment.", detail };
    case "gateway_restarted":
      return { body: "The assistant restarted while working on this. Send your message again to continue." };
    case "step_limit":
      return { body: "This took more steps than allowed, so it stopped. Try a narrower request.", detail };
    case "model_error":
      return { body: LOOKS_TECHNICAL.test(message) || message.length > 200 ? "The model returned an error. Try again." : message, detail };
  }
  return LOOKS_TECHNICAL.test(message) || message.length > 200 ? { body: "Something went wrong on our side. Try again.", detail } : { body: message };
}

/* ------------------------------------------------------------------ usage */

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatUsage(u: Usage): string {
  const parts = [`${formatTokens(u.input_tokens)} in`, `${formatTokens(u.output_tokens)} out`];
  if (u.cache_read_tokens > 0) parts.push(`${formatTokens(u.cache_read_tokens)} cached`);
  parts.push(formatCost(u.cost_usd));
  return parts.join(" · ");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ steps */

export function stepSummary(step: StepPart): string {
  if (step.status === "running") return step.title || (step.kind === "code" ? "Running code" : "Reading files");
  return step.title || (step.kind === "code" ? "Ran code" : "Read files");
}

/** Tool-call statuses as a word for screen readers and the row's trailing hint. */
export function toolStatusLabel(call: ToolCallPart): string {
  switch (call.status) {
    case "started":
      return "In progress";
    case "done":
      return "Done";
    case "error":
      return "Failed";
    case "declined":
      return "Declined";
  }
}

/* ------------------------------------------------------------------ artifacts */

export type ArtifactView = "markdown" | "code" | "image" | "pdf" | "html" | "text" | "download";

const CODE_EXT: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", py: "python",
  rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift", c: "c", h: "c",
  cpp: "cpp", cs: "csharp", php: "php", sh: "bash", bash: "bash", zsh: "bash", sql: "sql",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", css: "css", scss: "scss",
  r: "r", ipynb: "json",
};

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** How the document panel should show a file, and the highlight language for code. */
export function artifactView(mime: string, name: string): { view: ArtifactView; language?: string } {
  const ext = extensionOf(name);
  const m = mime.toLowerCase().split(";")[0]!.trim();
  if (m === "text/markdown" || ext === "md" || ext === "markdown") return { view: "markdown" };
  if (m.startsWith("image/")) return { view: "image" };
  if (m === "application/pdf" || ext === "pdf") return { view: "pdf" };
  if (m === "text/html" || ext === "html" || ext === "htm") return { view: "html" };
  if (CODE_EXT[ext]) return { view: "code", language: CODE_EXT[ext] };
  if (m === "application/json") return { view: "code", language: "json" };
  if (m === "text/csv" || ext === "csv" || ext === "tsv") return { view: "text" };
  if (m.startsWith("text/") || ext === "txt" || ext === "log") return { view: "text" };
  return { view: "download" };
}

/** What to call a document: the title it was presented with, else its file name. */
export function artifactLabel(a: Pick<ArtifactInfo, "name" | "title">): string {
  return a.title?.trim() || a.name;
}

/**
 * Which new file, if any, should open the documents panel by itself: the first document.
 * Images are left alone; a chart already shows in the thread.
 */
export function autoOpenArtifact(fresh: ArtifactInfo[]): string | undefined {
  return fresh.find((a) => !a.mime.startsWith("image/"))?.artifact_id;
}

export function artifactList(t: Pick<Transcript, "artifacts">): ArtifactInfo[] {
  return Object.values(t.artifacts);
}
