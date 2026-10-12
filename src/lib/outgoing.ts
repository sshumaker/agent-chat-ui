import type { Attachment, Transcript, UserTurn } from "../model";

/**
 * A message the user sent that the transcript doesn't show yet. It is "sending" until
 * the POST returns, then either "queued" (the agent is mid-turn; the host delivers it
 * when the turn ends) or simply waiting for its `user_message` event. "failed" keeps the
 * text on screen with a retry.
 */
export interface Outgoing {
  cid: string;
  text: string;
  attachments: Attachment[];
  status: "sending" | "sent" | "queued" | "failed";
  message_id?: string;
  error?: string;
  /** How many user turns the transcript had when this was sent. */
  baseUserCount: number;
}

export function userTurns(t: Pick<Transcript, "items">): UserTurn[] {
  return t.items.filter((i): i is UserTurn => i.role === "user");
}

/** Outgoing messages the transcript has not absorbed yet, matched by id, else by text after the send point. */
export function unabsorbed(outgoing: readonly Outgoing[], t: Pick<Transcript, "items">): Outgoing[] {
  const users = userTurns(t);
  const ids = new Set(users.map((u) => u.message_id));
  const claimed = new Set<number>();
  return outgoing.filter((o) => {
    if (o.message_id && ids.has(o.message_id)) return false;
    if (o.message_id) return true;
    const idx = users.findIndex((u, i) => i >= o.baseUserCount && !claimed.has(i) && u.text === o.text);
    if (idx === -1) return true;
    claimed.add(idx);
    return false;
  });
}

export function inThread(o: Outgoing): boolean {
  return o.status === "sending" || o.status === "sent" || o.status === "failed";
}

export function isQueued(o: Outgoing): boolean {
  return o.status === "queued";
}

/** The last user message, for "Retry" after an error. */
export function lastUserMessage(t: Pick<Transcript, "items">): UserTurn | undefined {
  const users = userTurns(t);
  return users[users.length - 1];
}
