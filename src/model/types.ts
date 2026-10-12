export type ConversationState =
  | "idle"
  | "working"
  | "waiting_for_user"
  | "starting";

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export type InteractionAnswer =
  | { kind: "approve"; approved: boolean; remember?: boolean }
  | { kind: "question"; selected_ids?: string[]; text?: string };

/** A workspace file a gated call would send, as the approval card shows it. */
export interface ActionFileSummary {
  path: string;
  name: string;
  size: number;
  mime: string;
  /** The first ~1,500 characters, for text files. */
  preview?: string;
}

/**
 * What an approval would allow. `context` is optional and informational: `target` is the
 * result of the server's read-only lookup for the thing acted on (a Drive file's metadata,
 * with at least `name`); `files` summarises workspace files the call sends, by parameter.
 */
export interface InteractionAction {
  server: string;
  tool: string;
  args: Record<string, unknown>;
  context?: {
    target?: Record<string, unknown>;
    files?: Record<string, ActionFileSummary>;
  };
}

export interface InteractionOption {
  id: string;
  label: string;
  description?: string;
}


export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

interface EventBase {
  seq: number;
  ts: string;
}

export type StepKind = "code" | "file";
export type StepStatus = "ok" | "error" | "aborted";
export type ToolCallStatus = "started" | "done" | "error" | "declined";
export type TurnEndReason = "completed" | "stopped" | "error";

/** How a subagent (a child agent the main agent started with `spawn`) ended. */
export type ChildMessageDirection = "to_child" | "from_child";
export type ChildMessageKind = "follow_up" | "steer" | "answer" | "report" | "ask";

export type ChildEndStatus = "completed" | "error" | "stopped" | "limit";
export type ChildStatus = "running" | ChildEndStatus;

/** Why a turn started without a user message: the host resumed the agent. */
export interface TurnWake {
  /**
   * children: the subagents waited on finished; message: one of them wrote to the parent;
   * job: a background job (or a condition job) it waited on finished or printed; deadline:
   * time ran out.
   */
  reason: "children" | "message" | "deadline" | "job";
  /** The children whose results the resumed turn was given. */
  child_ids: string[];
}

export interface ImageOutput {
  mime: string;
  data_base64: string;
}

export type EventBody =
  | {
      type: "user_message";
      message_id: string;
      text: string;
      attachments: Attachment[];
    }
  | {
      type: "turn_started";
      turn_id: string;
      /** Set when the host resumed the agent (its subagents finished); no user_message precedes it. */
      wake?: TurnWake;
    }
  | { type: "state"; state: ConversationState }
  | { type: "text_delta"; message_id: string; delta: string }
  | { type: "message_done"; message_id: string; text: string }
  | { type: "thinking_delta"; message_id: string; delta: string }
  | { type: "thinking_started"; message_id: string }
  | {
      type: "step_started";
      step_id: string;
      kind: StepKind;
      title: string;
      code?: string;
    }
  | {
      type: "step_output";
      step_id: string;
      stream: "stdout" | "stderr";
      chunk: string;
    }
  | {
      type: "step_done";
      step_id: string;
      status: StepStatus;
      output?: string;
      error?: string;
      images?: ImageOutput[];
    }
  | {
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
  | {
      type: "interaction_requested";
      interaction_id: string;
      kind: "approve" | "question";
      title: string;
      body?: string;
      action?: InteractionAction;
      options?: InteractionOption[];
      allow_multiple?: boolean;
      allow_free_text?: boolean;
      /** Set when a subagent's tool call raised it; `child_name` is its name. */
      child_id?: string;
      child_name?: string;
    }
  | {
      type: "interaction_resolved";
      interaction_id: string;
      answer: InteractionAnswer;
      by: "user" | "timeout" | "stopped";
    }
  | {
      type: "artifact";
      artifact_id: string;
      name: string;
      mime: string;
      size: number;
      path: string;
      version: number;
      /** Set when the agent presents the file with a title; a later event without one keeps it. */
      title?: string;
    }
  | { type: "title"; title: string }
  | {
      type: "child_started";
      child_id: string;
      /** The name the agent gave it (`spawn(..., name=...)`). */
      name: string;
      /** provider/id, e.g. "anthropic/claude-haiku-4-5". */
      model: string;
      /** The task it was given, truncated. */
      prompt: string;
    }
  | {
      type: "child_step";
      child_id: string;
      step_id: string;
      title: string;
      status: "running" | StepStatus;
    }
  | {
      type: "child_tool_call";
      child_id: string;
      call_id: string;
      server: string;
      tool: string;
      label: string;
      status: ToolCallStatus;
    }
  | { type: "child_text"; child_id: string; message_id: string; text: string }
  | {
      /**
       * A message between the main agent and one of its subagents. to_child: follow_up /
       * steer (the agent redirects a running child) or answer (to the child's question);
       * from_child: report (a progress note) or ask (the child waits for an answer).
       */
      type: "child_message";
      child_id: string;
      message_id: string;
      direction: ChildMessageDirection;
      kind: ChildMessageKind;
      text: string;
    }
  | {
      type: "child_done";
      child_id: string;
      status: ChildEndStatus;
      /** Why it ended other than by completing ("turn limit (40) reached"). */
      reason?: string;
      /** Its final answer (what the main agent receives), truncated. */
      result?: string;
      turns: number;
      usage?: Usage;
    }
  | { type: "turn_done"; turn_id: string; reason: TurnEndReason; usage?: Usage }
  | { type: "error"; code: string; message: string; retryable: boolean };

export type Event = EventBase & EventBody;
export type EventType = EventBody["type"];
export type EventOf<T extends EventType> = Event & { type: T };

export const EVENT_TYPES: readonly EventType[] = [
  "user_message",
  "turn_started",
  "state",
  "text_delta",
  "message_done",
  "thinking_delta",
  "thinking_started",
  "step_started",
  "step_output",
  "step_done",
  "tool_call",
  "interaction_requested",
  "interaction_resolved",
  "artifact",
  "title",
  "child_started",
  "child_step",
  "child_tool_call",
  "child_text",
  "child_message",
  "child_done",
  "turn_done",
  "error",
];
