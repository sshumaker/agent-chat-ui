import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FileTextIcon, MailIcon, SearchIcon, CalendarDaysIcon, MoonIcon, SunIcon, RotateCcwIcon, PlayIcon, PlusIcon } from "lucide-react";
import { AgentChat, EMPTY_TRANSCRIPT, type AgentChatAdapter, type SendMessage, type Transcript } from "../src";
import { append, BRIEF, CSV, makeScenario, resolveDemoInteraction, scenarioEvents, SCENARIOS, type ScenarioId } from "./scenarios";
import "../dist/styles.css";
import "./demo.css";

function reply(t: Transcript, message: SendMessage): Transcript {
  const turnId = crypto.randomUUID();
  const files = message.attachments.length ? `\n\nAttached: ${message.attachments.map((a) => `**${a.name}**`).join(", ")}. Files stay in this browser session.` : "";
  return append(t,
    { type: "user_message", message_id: message.clientMessageId, text: message.text, attachments: message.attachments },
    { type: "turn_started", turn_id: turnId },
    { type: "message_done", message_id: crypto.randomUUID(), text: `You said: **${message.text || "Review these files"}**.${files}\n\nThis is the local example adapter. Use the examples above to explore tool calls, email approval, questions, and document previews.` },
    { type: "turn_done", turn_id: turnId, reason: "completed" },
    { type: "state", state: "idle" },
  );
}

export function Demo() {
  const [scenario, setScenario] = useState<ScenarioId>("email");
  const [transcript, setTranscript] = useState(() => makeScenario("email"));
  const current = useRef(transcript);
  const [dark, setDark] = useState(false);
  const [session, setSession] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<SendMessage[]>([]);
  const localFiles = useRef(new Map<string, File>());
  const [artifactUrls, setArtifactUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const urls = {
      brief: URL.createObjectURL(new Blob([BRIEF], { type: "text/markdown" })),
      metrics: URL.createObjectURL(new Blob([CSV], { type: "text/csv" })),
    };
    setArtifactUrls(urls);
    return () => { Object.values(urls).forEach(URL.revokeObjectURL); if (timer.current) clearTimeout(timer.current); };
  }, []);

  const update = (next: Transcript) => { current.current = next; setTranscript(next); };
  const cancelPlayback = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setPlaying(false); };
  const flushQueue = () => {
    const messages = queued.current.splice(0);
    if (messages.length) update(messages.reduce(reply, current.current));
  };
  const choose = (id: ScenarioId, replay = false) => {
    cancelPlayback();
    queued.current = [];
    localFiles.current.clear();
    setScenario(id);
    setSession((n) => n + 1);
    if (!replay || id === "home") { update(makeScenario(id)); return; }
    const events = scenarioEvents(id);
    update(append(EMPTY_TRANSCRIPT, ...events.slice(0, 4)));
    setPlaying(true);
    let at = 4;
    const tick = () => {
      update(append(current.current, events[at++]!));
      if (at < events.length) timer.current = setTimeout(tick, 650);
      else { timer.current = null; setPlaying(false); if (current.current.state === "idle") flushQueue(); }
    };
    timer.current = setTimeout(tick, 650);
  };

  const adapter: AgentChatAdapter = {
    async send(message) {
      if (current.current.state !== "idle") {
        queued.current.push(message);
        return { messageId: message.clientMessageId, queued: true };
      }
      update(reply(current.current, message));
      return { messageId: message.clientMessageId };
    },
    async answer(id, answer) {
      const resolved = resolveDemoInteraction(current.current, id, answer);
      cancelPlayback();
      update(resolved);
      flushQueue();
    },
    async stop() {
      cancelPlayback();
      let t = current.current;
      for (const id of t.pending_interactions) {
        t = append(t, { type: "interaction_resolved", interaction_id: id, answer: id === "email-approval" ? { kind: "approve", approved: false } : { kind: "question", text: "" }, by: "stopped" });
      }
      t = { ...t, items: t.items.map((item) => item.role === "assistant" ? { ...item, parts: item.parts.map((part) => part.type === "tool_call" && part.status === "started" ? { ...part, status: "declined" as const } : part.type === "child" && part.status === "running" ? { ...part, status: "stopped" as const } : part) } : item) };
      update(append(t, { type: "turn_done", turn_id: "demo-turn", reason: "stopped" }, { type: "state", state: "idle" }));
      flushQueue();
    },
    async upload(file) {
      const id = crypto.randomUUID();
      localFiles.current.set(id, file);
      return { id, name: file.name, mime: file.type || "application/octet-stream", size: file.size };
    },
    artifacts: {
      url: (artifact) => artifactUrls[artifact.artifact_id] ?? "",
    },
  };

  return <main className={`demo-shell${dark ? " demo-dark" : ""}`}>
    <header className="demo-toolbar">
      <div className="demo-identity"><span className="demo-mark">A</span><div><strong>Agent Chat UI</strong><span>Interactive component demo</span></div></div>
      <nav className="demo-scenarios" aria-label="Demo examples">
        {SCENARIOS.map(({ id, label }) => <button key={id} aria-pressed={scenario === id} onClick={() => choose(id)}>{label}</button>)}
      </nav>
      <div className="demo-controls">
        <button onClick={() => choose("home")}><PlusIcon size={15} /> New chat</button>
        <button onClick={() => choose(scenario)} aria-label="Reset example" title="Reset example"><RotateCcwIcon size={15} /></button>
        <button disabled={scenario === "home" || playing} onClick={() => choose(scenario, true)}><PlayIcon size={14} /> {playing ? "Playing…" : "Replay"}</button>
        <button onClick={() => setDark(!dark)} aria-label={dark ? "Use light appearance" : "Use dark appearance"}>{dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}</button>
      </div>
    </header>
    <div className="demo-note"><span className="demo-dot" /> Simulated data · no email is sent <span className="demo-tip">Expand tool rows, try the action buttons, or attach a file.</span></div>
    <div className="demo-chat">
      <AgentChat sessionKey={`demo-${session}`} state={{ transcript }} adapter={adapter} appearance={dark ? "dark" : "light"}
        onNewChat={() => choose("home")}
        branding={{ agentName: "Atlas", greeting: "Meet Atlas", tagline: "Your assistant, your brand.", footer: null }}
        theme={{ "--chat-accent": "#0d9488", "--chat-accent-soft": "#0d948820", "--chat-accent-foreground": dark ? "#5eead4" : "#0f766e", "--chat-ring": "#0d948880" }}
        suggestions={[
          { text: "Draft a project update", icon: <MailIcon size={16} /> },
          { text: "Research a topic", icon: <SearchIcon size={16} /> },
          { text: "Summarize a document", icon: <FileTextIcon size={16} /> },
          { text: "Plan my week", icon: <CalendarDaysIcon size={16} /> },
        ]} />
    </div>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
