import type {
  Attachment,
  ChildMessageDirection,
  ChildMessageKind,
  ChildStatus,
  ConversationState,
  Event,
  ImageOutput,
  InteractionAnswer,
  InteractionAction,
  InteractionOption,
  StepKind,
  StepStatus,
  ToolCallStatus,
  TurnEndReason,
  TurnWake,
  Usage,
} from "./types";

export interface StepPart {
  type: "step";
  step_id: string;
  kind: StepKind;
  title: string;
  code?: string;
  stdout: string;
  stderr: string;
  status: "running" | StepStatus;
  output?: string;
  error?: string;
  images: ImageOutput[];
}

export interface ToolCallPart {
  type: "tool_call";
  call_id: string;
  step_id?: string;
  server: string;
  tool: string;
  label: string;
  args_preview: string;
  status: ToolCallStatus;
  result_preview?: string;
}

export interface TextPart {
  type: "text";
  message_id: string;
  text: string;
  streaming: boolean;
}

export interface ThinkingPart {
  type: "thinking";
  message_id: string;
  text: string;
}

export interface InteractionPart {
  type: "interaction";
  interaction_id: string;
  kind: "approve" | "question";
  title: string;
  body?: string;
  action?: InteractionAction;
  options?: InteractionOption[];
  allow_multiple?: boolean;
  allow_free_text?: boolean;
  answer?: InteractionAnswer;
  resolved_by?: "user" | "timeout" | "stopped";
  /** Raised by a subagent's tool call. */
  child_id?: string;
  child_name?: string;
}

/** One line of a subagent's activity log, in order. */
export type ChildActivity =
  | { kind: "step"; step_id: string; title: string; status: "running" | StepStatus }
  | { kind: "tool_call"; call_id: string; label: string; status: ToolCallStatus }
  | { kind: "text"; message_id: string; text: string }
  | { kind: "message"; message_id: string; direction: ChildMessageDirection; message_kind: ChildMessageKind; text: string };

/**
 * A subagent the main agent started, as one collapsible group inside the turn that
 * started it. Its later events update it in place, even after that turn has ended
 * (a child can outlive the turn that spawned it).
 */
export interface ChildPart {
  type: "child";
  child_id: string;
  name: string;
  model: string;
  prompt: string;
  status: ChildStatus;
  activity: ChildActivity[];
  /** Steps it has started (the activity's step lines). */
  steps: number;
  result?: string;
  reason?: string;
  turns?: number;
  usage?: Usage;
}

export interface ArtifactPart {
  type: "artifact";
  artifact_id: string;
}

export interface ErrorPart {
  type: "error";
  code: string;
  message: string;
  retryable: boolean;
}

export type AssistantPart =
  | TextPart
  | ThinkingPart
  | StepPart
  | ToolCallPart
  | InteractionPart
  | ArtifactPart
  | ChildPart
  | ErrorPart;

export interface UserTurn {
  role: "user";
  message_id: string;
  text: string;
  attachments: Attachment[];
  ts: string;
}

export interface AssistantTurn {
  role: "assistant";
  turn_id: string;
  parts: AssistantPart[];
  status: "running" | TurnEndReason;
  usage?: Usage;
  ts: string;
  /** The host resumed the agent without a user message (its subagents finished). */
  wake?: TurnWake;
}

export type TranscriptItem = UserTurn | AssistantTurn;

export interface ArtifactInfo {
  artifact_id: string;
  name: string;
  mime: string;
  size: number;
  path: string;
  version: number;
  /** The name the agent presented it under ("Q3 research brief"), when it gave one. */
  title?: string;
}

export interface Transcript {
  items: TranscriptItem[];
  state: ConversationState;
  title?: string;
  artifacts: Record<string, ArtifactInfo>;
  pending_interactions: string[];
  last_seq: number;
}

export const EMPTY_TRANSCRIPT: Transcript = {
  items: [],
  state: "idle",
  artifacts: {},
  pending_interactions: [],
  last_seq: 0,
};

function currentAssistant(items: TranscriptItem[]): AssistantTurn | undefined {
  const last = items[items.length - 1];
  return last?.role === "assistant" && last.status === "running"
    ? last
    : undefined;
}

function ensureAssistant(t: Transcript, ts: string): AssistantTurn {
  const open = currentAssistant(t.items);
  if (open) return open;
  const turn: AssistantTurn = {
    role: "assistant",
    turn_id: `orphan-${t.last_seq}`,
    parts: [],
    status: "running",
    ts,
  };
  t.items.push(turn);
  return turn;
}

function findPart<P extends AssistantPart>(
  t: Transcript,
  pred: (p: AssistantPart) => p is P,
): P | undefined {
  for (let i = t.items.length - 1; i >= 0; i--) {
    const item = t.items[i];
    if (item?.role !== "assistant") continue;
    const hit = item.parts.find(pred);
    if (hit) return hit;
  }
  return undefined;
}

const isText =
  (id: string) =>
  (p: AssistantPart): p is TextPart =>
    p.type === "text" && p.message_id === id;
const isThinking =
  (id: string) =>
  (p: AssistantPart): p is ThinkingPart =>
    p.type === "thinking" && p.message_id === id;
const isStep =
  (id: string) =>
  (p: AssistantPart): p is StepPart =>
    p.type === "step" && p.step_id === id;
const isToolCall =
  (id: string) =>
  (p: AssistantPart): p is ToolCallPart =>
    p.type === "tool_call" && p.call_id === id;
const isInteraction =
  (id: string) =>
  (p: AssistantPart): p is InteractionPart =>
    p.type === "interaction" && p.interaction_id === id;

const isChild =
  (id: string) =>
  (p: AssistantPart): p is ChildPart =>
    p.type === "child" && p.child_id === id;

/** The turn holding a child's group, so a late child event lands where the child is shown. */
function turnOfChild(t: Transcript, childId: string): AssistantTurn | undefined {
  for (let i = t.items.length - 1; i >= 0; i--) {
    const item = t.items[i];
    if (item?.role === "assistant" && item.parts.some(isChild(childId))) return item;
  }
  return undefined;
}

function upsertActivity(child: ChildPart, line: ChildActivity): void {
  const same = child.activity.findIndex(
    (a) =>
      a.kind === line.kind &&
      ((a.kind === "step" && line.kind === "step" && a.step_id === line.step_id) ||
        (a.kind === "tool_call" && line.kind === "tool_call" && a.call_id === line.call_id) ||
        (a.kind === "text" && line.kind === "text" && a.message_id === line.message_id) ||
        (a.kind === "message" && line.kind === "message" && a.message_id === line.message_id)),
  );
  if (same >= 0) child.activity[same] = line;
  else {
    child.activity.push(line);
    if (line.kind === "step") child.steps += 1;
  }
}

function clone(t: Transcript): Transcript {
  return structuredClone(t);
}

/**
 * Fold one event into a transcript. Pure: returns a new transcript, never mutates
 * the input. Events at or below `last_seq` are ignored, so replaying an overlapping
 * range (reconnect with a stale cursor) is safe.
 */
export function reduce(prev: Transcript, event: Event): Transcript {
  if (event.seq <= prev.last_seq) return prev;
  const t = clone(prev);
  t.last_seq = event.seq;
  apply(t, event);
  return t;
}

export function reduceAll(
  events: readonly Event[],
  start: Transcript = EMPTY_TRANSCRIPT,
): Transcript {
  let t = clone(start);
  for (const e of events) {
    if (e.seq <= t.last_seq) continue;
    t.last_seq = e.seq;
    apply(t, e);
  }
  return t;
}

function apply(t: Transcript, e: Event): void {
  switch (e.type) {
    case "user_message":
      t.items.push({
        role: "user",
        message_id: e.message_id,
        text: e.text,
        attachments: e.attachments,
        ts: e.ts,
      });
      return;
    case "turn_started":
      t.items.push({
        role: "assistant",
        turn_id: e.turn_id,
        parts: [],
        status: "running",
        ts: e.ts,
        ...(e.wake ? { wake: e.wake } : {}),
      });
      return;
    case "state":
      t.state = e.state;
      return;
    case "text_delta": {
      const part = findPart(t, isText(e.message_id));
      if (part) part.text += e.delta;
      else
        ensureAssistant(t, e.ts).parts.push({
          type: "text",
          message_id: e.message_id,
          text: e.delta,
          streaming: true,
        });
      return;
    }
    case "message_done": {
      const part = findPart(t, isText(e.message_id));
      if (part) {
        part.text = e.text;
        part.streaming = false;
      } else {
        ensureAssistant(t, e.ts).parts.push({
          type: "text",
          message_id: e.message_id,
          text: e.text,
          streaming: false,
        });
      }
      return;
    }
    case "thinking_started": {
      // The model began thinking. With thinking display omitted no delta ever follows, so
      // this empty part is the only sign of it; a later delta fills it in place.
      if (!findPart(t, isThinking(e.message_id)))
        ensureAssistant(t, e.ts).parts.push({ type: "thinking", message_id: e.message_id, text: "" });
      return;
    }
    case "thinking_delta": {
      const part = findPart(t, isThinking(e.message_id));
      if (part) part.text += e.delta;
      else
        ensureAssistant(t, e.ts).parts.push({
          type: "thinking",
          message_id: e.message_id,
          text: e.delta,
        });
      return;
    }
    case "step_started": {
      // A step can be announced while its code is still streaming, then re-sent with the
      // final code and title when it runs: the repeat updates the first in place.
      const known = findPart(t, isStep(e.step_id));
      if (known) {
        known.kind = e.kind;
        known.title = e.title;
        if (e.code !== undefined) known.code = e.code;
        return;
      }
      ensureAssistant(t, e.ts).parts.push({
        type: "step",
        step_id: e.step_id,
        kind: e.kind,
        title: e.title,
        code: e.code,
        stdout: "",
        stderr: "",
        status: "running",
        images: [],
      });
      return;
    }
    case "step_output": {
      const part = findPart(t, isStep(e.step_id));
      if (part) part[e.stream] += e.chunk;
      return;
    }
    case "step_done": {
      const part = findPart(t, isStep(e.step_id));
      if (!part) return;
      part.status = e.status;
      part.output = e.output;
      part.error = e.error;
      part.images = e.images ?? [];
      return;
    }
    case "tool_call": {
      const part = findPart(t, isToolCall(e.call_id));
      if (part) {
        part.status = e.status;
        part.label = e.label;
        if (e.result_preview !== undefined)
          part.result_preview = e.result_preview;
      } else {
        ensureAssistant(t, e.ts).parts.push({
          type: "tool_call",
          call_id: e.call_id,
          step_id: e.step_id,
          server: e.server,
          tool: e.tool,
          label: e.label,
          args_preview: e.args_preview,
          status: e.status,
          result_preview: e.result_preview,
        });
      }
      return;
    }
    case "interaction_requested":
      ((e.child_id ? turnOfChild(t, e.child_id) : undefined) ?? ensureAssistant(t, e.ts)).parts.push({
        type: "interaction",
        interaction_id: e.interaction_id,
        kind: e.kind,
        title: e.title,
        body: e.body,
        action: e.action,
        options: e.options,
        allow_multiple: e.allow_multiple,
        allow_free_text: e.allow_free_text,
        ...(e.child_id ? { child_id: e.child_id, child_name: e.child_name } : {}),
      });
      if (!t.pending_interactions.includes(e.interaction_id))
        t.pending_interactions.push(e.interaction_id);
      return;
    case "interaction_resolved": {
      const part = findPart(t, isInteraction(e.interaction_id));
      if (part) {
        part.answer = e.answer;
        part.resolved_by = e.by;
      }
      t.pending_interactions = t.pending_interactions.filter(
        (id) => id !== e.interaction_id,
      );
      return;
    }
    case "artifact": {
      const known = t.artifacts[e.artifact_id];
      t.artifacts[e.artifact_id] = {
        artifact_id: e.artifact_id,
        name: e.name,
        mime: e.mime,
        size: e.size,
        path: e.path,
        version: e.version,
        ...(e.title ?? known?.title ? { title: e.title ?? known?.title } : {}),
      };
      if (!known) {
        const turn = currentAssistant(t.items);
        if (turn)
          turn.parts.push({ type: "artifact", artifact_id: e.artifact_id });
      }
      return;
    }
    case "title":
      t.title = e.title;
      return;
    case "child_started": {
      if (findPart(t, isChild(e.child_id))) return;
      ensureAssistant(t, e.ts).parts.push({
        type: "child",
        child_id: e.child_id,
        name: e.name,
        model: e.model,
        prompt: e.prompt,
        status: "running",
        activity: [],
        steps: 0,
      });
      return;
    }
    case "child_step": {
      const child = findPart(t, isChild(e.child_id));
      if (child) upsertActivity(child, { kind: "step", step_id: e.step_id, title: e.title, status: e.status });
      return;
    }
    case "child_tool_call": {
      const child = findPart(t, isChild(e.child_id));
      if (child) upsertActivity(child, { kind: "tool_call", call_id: e.call_id, label: e.label, status: e.status });
      return;
    }
    case "child_text": {
      const child = findPart(t, isChild(e.child_id));
      if (child) upsertActivity(child, { kind: "text", message_id: e.message_id, text: e.text });
      return;
    }
    case "child_message": {
      const child = findPart(t, isChild(e.child_id));
      if (child)
        upsertActivity(child, {
          kind: "message",
          message_id: e.message_id,
          direction: e.direction,
          message_kind: e.kind,
          text: e.text,
        });
      return;
    }
    case "child_done": {
      const child = findPart(t, isChild(e.child_id));
      if (!child) return;
      child.status = e.status;
      child.turns = e.turns;
      if (e.result !== undefined) child.result = e.result;
      if (e.reason !== undefined) child.reason = e.reason;
      if (e.usage) child.usage = e.usage;
      for (const a of child.activity) if (a.kind === "step" && a.status === "running") a.status = "aborted";
      return;
    }
    case "turn_done": {
      const turn = currentAssistant(t.items);
      if (!turn) return;
      turn.status = e.reason;
      turn.usage = e.usage;
      for (const p of turn.parts) {
        if (p.type === "text") p.streaming = false;
        if (p.type === "step" && p.status === "running") p.status = "aborted";
      }
      return;
    }
    case "error": {
      const part: ErrorPart = {
        type: "error",
        code: e.code,
        message: e.message,
        retryable: e.retryable,
      };
      const turn = currentAssistant(t.items);
      if (turn) turn.parts.push(part);
      else
        t.items.push({
          role: "assistant",
          turn_id: `error-${e.seq}`,
          parts: [part],
          status: "error",
          ts: e.ts,
        });
      return;
    }
  }
}
