"use client";
import type { Attachment, InteractionAnswer } from "../../model";
import type { AgentChatAdapter, ChatState } from "../../adapter";
import { ArrowDownIcon, FilesIcon, MessageSquarePlusIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { ChatProvider, useChatBranding, type ChatBranding, type ChatTheme } from "../branding";
import { inThread, isQueued, lastUserMessage, unabsorbed, userTurns, type Outgoing } from "../../lib/outgoing";
import { artifactList, isBusy, threadStatus, autoOpenArtifact } from "../../lib/view-model";
import { cn } from "../../lib/utils";
import { ChatContext, type ChatActions } from "./chat-context";
import { Composer, type ComposerHandle } from "./composer";
import { DocumentsPanel } from "./documents-panel";
import { EmptyGreeting, SuggestionChips, type ChatSuggestion } from "./empty-state";
import { AssistantMessage, UserMessage } from "./messages";
import { StatusPill } from "./status-pill";

export interface AgentChatProps {
  /** Change this when switching sessions; resets drafts, uploads, and pending messages. */
  sessionKey: string;
  state: ChatState;
  adapter: AgentChatAdapter;
  branding?: ChatBranding;
  theme?: ChatTheme;
  appearance?: "light" | "dark";
  userName?: string;
  suggestions?: ChatSuggestion[];
  onNewChat?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function AgentChat(props: AgentChatProps) {
  return <ChatProvider branding={props.branding} theme={props.theme} appearance={props.appearance} className={props.className} style={props.style}>
    <ChatView key={props.sessionKey} {...props} />
  </ChatProvider>;
}

function ChatView({ state, adapter, userName, suggestions, onNewChat }: AgentChatProps) {
  const data = { ...state, loaded: state.loaded ?? true };
  const { transcript } = data;
  const title = transcript.title;
  const brand = useChatBranding();
  const composerRef = useRef<ComposerHandle>(null);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const pendingOut = useMemo(() => unabsorbed(outgoing, transcript), [outgoing, transcript]);
  const inThreadOut = pendingOut.filter(inThread);
  const queuedOut = pendingOut.filter(isQueued);
  const status = threadStatus(transcript, data.stream ?? null);
  const agentBusy = isBusy(threadStatus(transcript, null));
  const [stopping, setStopping] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => { if (!agentBusy) setStopping(false); }, [agentBusy]);
  const send = useCallback(async (text: string, attachments: Attachment[], replaceCid?: string) => {
    const cid = crypto.randomUUID();
    const entry: Outgoing = { cid, text, attachments, status: agentBusy ? "queued" : "sending", baseUserCount: userTurns(transcript).length };
    setOutgoing((o) => [...o.filter((x) => x.cid !== replaceCid), entry]);
    try {
      const result = await adapter.send({ text, attachments, clientMessageId: cid });
      setOutgoing((o) => o.map((x) => x.cid === cid ? { ...x, message_id: result.messageId, status: result.queued ? "queued" : "sent" } : x));
    } catch (error) {
      setOutgoing((o) => o.map((x) => x.cid === cid ? { ...x, status: "failed", error: error instanceof Error ? error.message : "Couldn't send message" } : x));
    }
  }, [adapter, agentBusy, transcript]);
  const stop = useCallback(async () => {
    setStopping(true);
    setActionError(null);
    try { await adapter.stop?.(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Couldn't stop the agent"); }
    finally { setStopping(false); }
  }, [adapter]);
  const answer = useCallback((id: string, value: InteractionAnswer) => adapter.answer(id, value), [adapter]);
  const retry = useCallback(() => { const last = lastUserMessage(transcript); if (last) void send(last.text, last.attachments); }, [transcript, send]);
  /* ------------------------------------------------ documents */
  const artifacts = artifactList(transcript);
  const [panel, setPanel] = useState<{ open: boolean; active: string | null }>({ open: false, active: null });
  const knownArtifacts = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data.loaded) return;
    const ids = Object.keys(transcript.artifacts);
    if (knownArtifacts.current === null) {
      knownArtifacts.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !knownArtifacts.current!.has(id));
    fresh.forEach((id) => knownArtifacts.current!.add(id));
    const toOpen = autoOpenArtifact(fresh.map((id) => transcript.artifacts[id]!));
    if (toOpen && typeof window !== "undefined" && window.matchMedia?.("(min-width: 1280px)").matches) {
      setPanel((p) => (p.open ? p : { open: true, active: toOpen }));
    }
  }, [transcript.artifacts, data.loaded]);

  const actions = useMemo<ChatActions>(
    () => ({ answer, retry, openArtifact: (id) => setPanel({ open: true, active: id }) }),
    [answer, retry],
  );

  /* ------------------------------------------------ focus + drag/drop */
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!adapter.upload || !hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (adapter.upload && hasFiles(e)) e.preventDefault();
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!adapter.upload || !hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      composerRef.current?.addFiles(Array.from(e.dataTransfer.files));
    },
  };

  /* ------------------------------------------------ scrolling */
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(true);
  const stuckRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const ro = new ResizeObserver(() => {
      if (stuckRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [data.loaded, transcript.items.length === 0 && inThreadOut.length === 0]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stuckRef.current = near;
    setStuck(near);
  };
  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    stuckRef.current = true;
    setStuck(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  /* ------------------------------------------------ render */
  const isEmpty = transcript.items.length === 0 && inThreadOut.length === 0;
  const showEmpty = data.loaded && isEmpty && !data.notFound && !data.loadError;

  if (data.notFound) {
    return (
      <div className="flex h-full flex-col">
        <ChatHeader title="Not found" status="idle" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-lg font-medium">This chat doesn&apos;t exist or was deleted.</p>
          {onNewChat ? <Button onClick={onNewChat}>
            <MessageSquarePlusIcon /> Start a new chat
          </Button> : null}
        </div>
      </div>
    );
  }

  const composer = (
    <Composer
      ref={composerRef}
      busy={agentBusy}
      onStop={adapter.stop ? stop : undefined}
      stopping={stopping}
      onSubmit={(text, atts) => void send(text, atts)}
      upload={adapter.upload}
      queued={queuedOut}
      autoFocus
      onActivity={adapter.onActivity}
      placeholder={brand.placeholder}
      disabled={!data.loaded || Boolean(data.loadError)}
    />
  );

  return (
    <ChatContext.Provider value={actions}>
      <div className="relative flex h-full min-h-0">
        <div className="relative flex min-w-0 flex-1 flex-col" {...dropHandlers}>
          <ChatHeader
            title={showEmpty ? "" : title ?? "New chat"}
            status={status}
            docCount={artifacts.length}
            docsOpen={panel.open}
            onToggleDocs={adapter.artifacts && artifacts.length ? () => setPanel((p) => ({ open: !p.open, active: p.active })) : undefined}
          />

          {actionError ? <p role="alert" className="px-4 py-2 text-sm text-danger">{actionError}</p> : null}
          {showEmpty ? (
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-[12vh]">
              <div className="w-full max-w-2xl">
                <EmptyGreeting name={userName} />
                {composer}
                <SuggestionChips onPick={(t) => void send(t, [])} suggestions={suggestions} />
              </div>
            </div>
          ) : (
            <>
              <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin" data-testid="thread">
                <div ref={contentRef} className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-6 pb-10 sm:px-6">
                  {!data.loaded ? (
                    <div className="flex justify-center py-20">
                      <Spinner label="Loading conversation" />
                    </div>
                  ) : null}
                  {data.loadError ? (
                    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
                      Couldn&apos;t load this chat — {data.loadError}.{" "}
                      <button type="button" className="font-medium underline" onClick={adapter.reload} disabled={!adapter.reload}>
                        Try again
                      </button>
                    </div>
                  ) : null}
                  {transcript.items.map((item, i) =>
                    item.role === "user" ? (
                      <UserMessage key={item.message_id} text={item.text} attachments={item.attachments} />
                    ) : (
                      <AssistantMessage
                        key={item.turn_id}
                        turn={item}
                        artifacts={transcript.artifacts}
                        isLast={i === transcript.items.length - 1}
                        starting={status === "starting" && i === transcript.items.length - 1}
                      />
                    ),
                  )}
                  {inThreadOut.map((o) => (
                    <UserMessage
                      key={o.cid}
                      text={o.text}
                      attachments={o.attachments}
                      pending={o.status !== "failed"}
                      failed={o.status === "failed" ? o.error : undefined}
                      onRetry={() => void send(o.text, o.attachments, o.cid)}
                    />
                  ))}
                  {inThreadOut.some((o) => o.status !== "failed") && !transcript.items.some((i) => i.role === "assistant" && i.status === "running") ? (
                    <PendingReply />
                  ) : null}
                </div>
              </div>
              {!stuck ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-36 flex justify-center">
                  <Button variant="outline" size="xs" onClick={jumpToLatest} className="pointer-events-auto rounded-full shadow-card" aria-label="Jump to latest">
                    <ArrowDownIcon /> Latest
                  </Button>
                </div>
              ) : null}
              <div className="mx-auto w-full max-w-3xl px-4 pb-3 sm:px-6">
                {composer}
                <p className="mt-2 text-center text-[11px] text-faint">{brand.footer === undefined ? `${brand.agentName} can make mistakes. Check important details.` : brand.footer}</p>
              </div>
            </>
          )}

          {dragging ? (
            <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 backdrop-blur-sm animate-fade-in">
              <p className="flex items-center gap-2 text-sm font-medium text-accent-foreground">
                <UploadIcon className="size-4" /> Drop files to attach
              </p>
            </div>
          ) : null}
        </div>

        {adapter.artifacts && panel.open ? (
          <>
            <DocumentsPanel
              access={adapter.artifacts}
              artifacts={artifacts}
              activeId={panel.active}
              onSelect={(id) => setPanel({ open: true, active: id })}
              onClose={() => setPanel((p) => ({ ...p, open: false }))}
              className="hidden w-[46%] max-w-[760px] min-w-[380px] lg:flex"
            />
            <div className="absolute inset-0 z-40 flex bg-background lg:hidden">
              <DocumentsPanel
                access={adapter.artifacts}
                artifacts={artifacts}
                activeId={panel.active}
                onSelect={(id) => setPanel({ open: true, active: id })}
                onClose={() => setPanel((p) => ({ ...p, open: false }))}
                className="w-full border-l-0"
              />
            </div>
          </>
        ) : null}
      </div>
    </ChatContext.Provider>
  );
}

function PendingReply() {
  return (
    <div className="flex items-center gap-3 animate-fade-in" data-testid="pending-reply">
      <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent-soft">
        <Spinner className="size-3.5 text-accent" label="Sending" />
      </span>
      <span className="text-sm text-shimmer">Thinking…</span>
    </div>
  );
}

function ChatHeader({
  title,
  status,
  docCount = 0,
  docsOpen,
  onToggleDocs,
}: {
  title: string;
  status: ReturnType<typeof threadStatus>;
  docCount?: number;
  docsOpen?: boolean;
  onToggleDocs?: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4">
      {title ? (
        <h1 className="min-w-0 truncate text-[15px] font-medium" data-testid="chat-title">
          {title}
        </h1>
      ) : null}
      <StatusPill status={status} />
      <div className="ml-auto flex items-center gap-1">
        {onToggleDocs ? (
          <Button
            variant={docsOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleDocs}
            aria-pressed={docsOpen}
            aria-label={`Documents (${docCount})`}
            data-testid="documents-toggle"
            className={cn(docsOpen && "text-foreground")}
          >
            <FilesIcon /> <span className="hidden sm:inline">Documents</span>
            <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{docCount}</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
