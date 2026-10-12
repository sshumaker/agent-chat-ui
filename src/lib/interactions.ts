import type { InteractionAnswer, InteractionPart } from "../model";

/* ---------------------------------------------------------- state machine */

/**
 * The client side of one approval or question. The card is never removed: it goes
 * pending → submitting → resolved, and a failed POST drops back to pending with the
 * error shown so the user can try again. The server's `interaction_resolved` event is
 * authoritative and resolves the card from any state.
 */
export type InteractionUiState =
  | { status: "pending"; error?: string }
  | { status: "submitting"; answer: InteractionAnswer }
  | { status: "resolved"; answer: InteractionAnswer; by: "user" | "timeout" | "stopped" };

export type InteractionUiAction =
  | { type: "submit"; answer: InteractionAnswer }
  | { type: "succeeded" }
  | { type: "failed"; message: string }
  | { type: "already_resolved" }
  | { type: "server_resolved"; answer: InteractionAnswer; by: "user" | "timeout" | "stopped" };

export function initialInteractionState(part: InteractionPart): InteractionUiState {
  if (part.answer && part.resolved_by) return { status: "resolved", answer: part.answer, by: part.resolved_by };
  return { status: "pending" };
}

export function interactionReducer(state: InteractionUiState, action: InteractionUiAction): InteractionUiState {
  switch (action.type) {
    case "submit":
      return state.status === "pending" ? { status: "submitting", answer: action.answer } : state;
    case "succeeded":
      return state.status === "submitting" ? { status: "resolved", answer: state.answer, by: "user" } : state;
    case "already_resolved":
      // 409: someone (another tab, a timeout) answered first. Keep our choice on screen
      // until the server event says what actually happened.
      return state.status === "submitting" ? { status: "resolved", answer: state.answer, by: "user" } : state;
    case "failed":
      return state.status === "submitting" ? { status: "pending", error: action.message } : state;
    case "server_resolved":
      return { status: "resolved", answer: action.answer, by: action.by };
  }
}

/* ---------------------------------------------------------- approvals */

export type ApprovalChoice = "once" | "always" | "deny";

export function approvalAnswer(choice: ApprovalChoice): InteractionAnswer {
  switch (choice) {
    case "once":
      return { kind: "approve", approved: true };
    case "always":
      return { kind: "approve", approved: true, remember: true };
    case "deny":
      return { kind: "approve", approved: false };
  }
}

export function choiceOf(answer: InteractionAnswer): ApprovalChoice | null {
  if (answer.kind !== "approve") return null;
  if (!answer.approved) return "deny";
  return answer.remember ? "always" : "once";
}

export function describeResolution(answer: InteractionAnswer, by: "user" | "timeout" | "stopped", part?: InteractionPart): string {
  if (by === "timeout") return "Timed out — no answer was given";
  if (by === "stopped") return "Cancelled when the task was stopped";
  if (answer.kind === "approve") {
    if (!answer.approved) return "Denied";
    return answer.remember ? "Always allowed in this chat" : "Allowed once";
  }
  const labels = (answer.selected_ids ?? []).map((id) => part?.options?.find((o) => o.id === id)?.label ?? id);
  const text = answer.text?.trim();
  return [...labels, ...(text ? [`“${text}”`] : [])].join(", ") || "Answered";
}

/* ---------------------------------------------------------- action preview */

export interface ActionField {
  label: string;
  value: string;
  multiline?: boolean;
}

export interface ActionDescription {
  /** "Send an email", "Create a calendar event" … */
  verb: string;
  icon: "mail" | "calendar" | "file" | "globe" | "tool";
  /** Where it goes: recipients, event time, file name. */
  target?: string;
  fields: ActionField[];
  /** "gmail.send_message" for the technical reader. */
  technical: string;
}

const str = (v: unknown): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean).join(", ") || undefined;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return str(o.dateTime ?? o.date ?? o.email ?? o.name) ?? JSON.stringify(v);
  }
  return String(v);
};

const pick = (args: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = str(args[k]);
    if (v) return v;
  }
  return undefined;
};

export function formatWhen(start?: string, end?: string): string | undefined {
  if (!start) return undefined;
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return end ? `${start} – ${end}` : start;
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(start);
  if (allDay) return `${day} (all day)`;
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!end) return `${day}, ${t(s)}`;
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return `${day}, ${t(s)}`;
  return `${day}, ${t(s)} – ${t(e)}`;
}

function humanise(tool: string): string {
  const words = tool.replace(/[_.-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const BODY_PREVIEW_CHARS = 1500;

function preview(body: string): string {
  return body.length > BODY_PREVIEW_CHARS ? `${body.slice(0, BODY_PREVIEW_CHARS).trimEnd()}…` : body;
}

const truthy = (v: unknown) => v === true || v === "true" || v === 1;

/**
 * Email: gmail_send / gmail_create_draft take {to[], cc[], subject, body, reply_to_message_id?}.
 * An empty subject on a reply means "Re: <original subject>".
 */
function describeEmail(args: Record<string, unknown>, technical: string, isDraft: boolean): ActionDescription {
  const to = pick(args, "to", "recipients", "recipient");
  const cc = pick(args, "cc");
  const bcc = pick(args, "bcc");
  const replying = Boolean(pick(args, "reply_to_message_id", "thread_id", "in_reply_to"));
  const subject = pick(args, "subject") ?? (replying ? "Re: (original subject)" : undefined);
  const body = pick(args, "body", "text", "message", "content");
  return {
    verb: isDraft ? "Save an email draft" : replying ? "Send a reply" : "Send an email",
    icon: "mail",
    target: [to ? `To ${to}` : undefined, subject].filter(Boolean).join(" · ") || undefined,
    technical,
    fields: [
      ...(to ? [{ label: "To", value: to }] : []),
      ...(cc ? [{ label: "Cc", value: cc }] : []),
      ...(bcc ? [{ label: "Bcc", value: bcc }] : []),
      ...(subject ? [{ label: "Subject", value: subject }] : []),
      ...(replying ? [{ label: "Thread", value: "Replies in the original conversation" }] : []),
      ...(body ? [{ label: "Message", value: preview(body), multiline: true }] : []),
    ],
  };
}

/** Calendar: calendar_create_event takes {summary, start, end, attendees[], location?, description?, add_video_call?, time_zone?}. */
function describeEvent(args: Record<string, unknown>, technical: string, key: string): ActionDescription {
  const title = pick(args, "summary", "title", "name");
  const zone = pick(args, "time_zone", "timeZone");
  const when = formatWhen(pick(args, "start", "start_time", "startTime"), pick(args, "end", "end_time", "endTime"));
  const attendees = pick(args, "attendees", "guests");
  const location = pick(args, "location");
  const description = pick(args, "description");
  const meet = truthy(args.add_video_call) || truthy(args.add_meet) ? "A Google Meet link will be added" : pick(args, "meet_link", "hangout_link");
  const verb = /delete|cancel/.test(key) ? "Delete a calendar event" : /update|patch|move/.test(key) ? "Update a calendar event" : "Create a calendar event";
  return {
    verb,
    icon: "calendar",
    target: [title, when].filter(Boolean).join(" · ") || undefined,
    technical,
    fields: [
      ...(title ? [{ label: "Title", value: title }] : []),
      ...(when ? [{ label: "When", value: zone ? `${when} (${zone})` : when }] : []),
      ...(attendees ? [{ label: "Guests", value: attendees }] : []),
      ...(location ? [{ label: "Where", value: location }] : []),
      ...(meet ? [{ label: "Video", value: meet }] : []),
      ...(description ? [{ label: "Notes", value: preview(description), multiline: true }] : []),
    ],
  };
}

/* ---------------------------------------------------------- drive */

const DRIVE_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.spreadsheet": "Google Sheet",
  "application/vnd.google-apps.presentation": "Google Slides",
  "application/vnd.google-apps.folder": "Folder",
  "application/pdf": "PDF",
  "text/csv": "CSV",
  "text/markdown": "Markdown",
  "text/plain": "Text",
};

const ACCESS: Record<string, string> = { reader: "Can view", commenter: "Can comment", writer: "Can edit" };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type Action = NonNullable<InteractionPart["action"]>;

/** The file a Drive call acts on: the name the host looked up, else its id. */
function driveFile(action: Action): { name: string; fields: ActionField[] } {
  const t = action.context?.target ?? {};
  const name = str(t.name) ?? `File ${str(action.args.file_id) ?? "(unknown)"}`;
  const type = str(t.mime_type) ? (DRIVE_TYPES[String(t.mime_type)] ?? String(t.mime_type)) : undefined;
  const owners = str(t.owners);
  return {
    name,
    fields: [
      { label: "File", value: name },
      ...(type ? [{ label: "Type", value: type }] : []),
      ...(owners ? [{ label: "Owner", value: owners }] : []),
    ],
  };
}

function describeDriveShare(action: Action, technical: string): ActionDescription {
  const file = driveFile(action);
  const email = pick(action.args, "email") ?? "(no one)";
  const access = ACCESS[String(action.args.role)] ?? humanise(String(action.args.role ?? "access"));
  const notify = action.args.notify !== false && action.args.notify !== "false";
  const message = pick(action.args, "message");
  return {
    verb: "Share a Drive file",
    icon: "file",
    target: `${file.name} · ${email} (${access.toLowerCase()})`,
    technical,
    fields: [
      ...file.fields,
      { label: "With", value: email },
      { label: "Access", value: access },
      { label: "Notify", value: notify ? "Google emails them a link" : "No email" },
      ...(notify && message ? [{ label: "Message", value: preview(message), multiline: true }] : []),
    ],
  };
}

function describeDriveTrash(action: Action, technical: string): ActionDescription {
  const file = driveFile(action);
  return {
    verb: "Move a file to the Drive trash",
    icon: "file",
    target: file.name,
    technical,
    fields: [...file.fields, { label: "Undo", value: "Restore it from the Drive trash within 30 days" }],
  };
}

function describeDriveUpdate(action: Action, technical: string): ActionDescription {
  const file = driveFile(action);
  const source = action.context?.files?.path;
  const markdown = pick(action.args, "markdown");
  const content: ActionField[] = source
    ? [
        { label: "From", value: `${source.name} (${formatBytes(source.size)})` },
        ...(source.preview !== undefined ? [{ label: "Preview", value: preview(source.preview), multiline: true }] : []),
      ]
    : markdown
      ? [{ label: "New content", value: preview(markdown), multiline: true }]
      : [];
  return {
    verb: "Replace a Drive file's content",
    icon: "file",
    target: file.name,
    technical,
    fields: [...file.fields, ...content, { label: "Undo", value: "Drive keeps the previous version in its history" }],
  };
}

const DRIVE_RENDERERS: Record<string, (action: Action, technical: string) => ActionDescription> = {
  drive_share: describeDriveShare,
  drive_trash: describeDriveTrash,
  drive_update_content: describeDriveUpdate,
};

/**
 * A readable summary of the side effect an approval would allow. Known shapes (mail,
 * calendar) get their recipients/subject or title/time up front; anything else shows its
 * arguments as a key–value list so nothing is hidden from the person approving.
 */
export function describeAction(action: InteractionPart["action"]): ActionDescription | null {
  if (!action) return null;
  const args = action.args ?? {};
  const technical = `${action.server}.${action.tool}`;
  const key = `${action.server} ${action.tool}`.toLowerCase();

  const drive = action.server === "google" ? DRIVE_RENDERERS[action.tool] : undefined;
  if (drive) return drive(action, technical);
  if (/(gmail|mail)/.test(key) && /(send|draft|reply|compose)/.test(key)) return describeEmail(args, technical, /draft/.test(key));
  if (/calendar|event/.test(key) && /(create|insert|update|patch|move|delete|cancel)/.test(key)) return describeEvent(args, technical, key);

  const fields = Object.entries(args).map(([k, v]) => {
    const value = str(v) ?? "";
    return { label: humanise(k), value, multiline: value.length > 80 || value.includes("\n") };
  });
  return {
    verb: humanise(action.tool),
    icon: /drive|file/.test(key) ? "file" : /web|http|fetch/.test(key) ? "globe" : "tool",
    target: fields[0] ? `${fields[0].label}: ${fields[0].value.slice(0, 80)}` : undefined,
    technical,
    fields,
  };
}
