import type { ArtifactInfo, Attachment, InteractionAnswer, Transcript } from "./model";

export type StreamStatus = "connecting" | "live" | "reconnecting" | "closed" | "gone";

export interface ChatState {
  transcript: Transcript;
  loaded?: boolean;
  notFound?: boolean;
  loadError?: string | null;
  stream?: StreamStatus | null;
}

export interface SendMessage {
  text: string;
  attachments: Attachment[];
  /** Stable for this attempt; useful as a host idempotency key. */
  clientMessageId: string;
}

export interface SendResult {
  /** Must match the eventual user turn's message_id. */
  messageId: string;
  queued?: boolean;
}

export interface ArtifactAccess {
  /** Return a URL usable by images, frames, and download links. */
  url: (artifact: ArtifactInfo, options?: { download?: boolean }) => string;
  /** Optional authenticated content loader; otherwise the UI fetches the URL. */
  loadText?: (url: string, signal: AbortSignal) => Promise<string>;
}

/** Bind these callbacks to the active agent/session. No network transport is assumed. */
export interface AgentChatAdapter {
  send: (message: SendMessage) => Promise<SendResult>;
  answer: (interactionId: string, answer: InteractionAnswer) => Promise<void>;
  stop?: () => Promise<void>;
  upload?: (file: File) => Promise<Attachment>;
  artifacts?: ArtifactAccess;
  reload?: () => void;
  onActivity?: () => void;
}

/** Throw when an interaction has already been answered elsewhere. */
export class InteractionResolvedError extends Error {
  constructor(message = "This interaction has already been resolved") {
    super(message);
    this.name = "InteractionResolvedError";
  }
}
