# Agent Chat UI

A standalone, white-label React chat renderer. Includes streaming Markdown and code, message composition and attachments, queued sends, tool activity, subagents, approvals, questions, usage details, and document previews. No conversation list, routing, authentication, connector management, or built-in agent transport.

## Build and preview

```sh
pnpm install --ignore-scripts
pnpm build
pnpm typecheck
pnpm test
pnpm dev
```

The local demo uses an in-memory adapter and a sample identity. It includes email approvals, expandable tool calls and code output, a subagent, downloadable document previews, and a multiple-choice question. Use Replay to watch events stream in, Reset to try an action again, or New chat to see suggestion pills with icons. The composer supports selecting, pasting, and dropping local attachments. No email is sent and no files are uploaded to a server. The demo imports the compiled stylesheet; rebuild after changing styles.

## Use from another app

```sh
pnpm add link:../agent-chat-ui
```

Use the appropriate relative path to this folder. Requires React and React DOM 18.2 or 19. Import the compiled CSS once; the consuming app does not need Tailwind or Next.js.

```tsx
import { AgentChat, type AgentChatAdapter, type Transcript } from "agent-chat-ui";
import "agent-chat-ui/styles.css";

// Bind these callbacks to your active agent/session and transport.
const adapter: AgentChatAdapter = {
  send: async ({ text, attachments, clientMessageId }) => {
    const result = await agent.send({ text, attachments, clientMessageId });
    return { messageId: result.id, queued: result.queued };
  },
  answer: (interactionId, answer) => agent.answer(interactionId, answer),
  stop: () => agent.stop(),
  upload: (file) => agent.upload(file),
  artifacts: {
    url: (artifact, options) => agent.fileUrl(artifact, options),
    // Optional, for text files needing custom auth headers or another loader:
    loadText: (url, signal) => agent.loadText(url, signal),
  },
};

// `transcript` is React state updated by your agent's stream/subscription.
function Chat({ sessionId, transcript }: { sessionId: string; transcript: Transcript }) {
  return (
    <div style={{ height: "100dvh" }}>
      <AgentChat
        sessionKey={sessionId}
        state={{ transcript }}
        adapter={adapter}
        branding={{
          agentName: "Atlas",
          avatar: <img src="/atlas.svg" alt="" width={20} height={20} />,
          greeting: "Meet Atlas",
          tagline: "How can I help your team?",
          placeholder: "Ask Atlas…",
          footer: null,
        }}
        theme={{
          "--chat-accent": "#0d9488",
          "--chat-accent-soft": "#0d948820",
          "--chat-accent-foreground": "#0f766e",
          "--chat-ring": "#0d948880",
          "--chat-font-sans": "Inter, system-ui, sans-serif",
        }}
        suggestions={[{ text: "Help me plan a project" }]}
      />
    </div>
  );
}
```

`agent` above represents your own client. No particular agent SDK is required. See `example/main.tsx` for a complete runnable adapter.

## Agent boundary

The host owns the canonical transcript, subscription, persistence, session creation, and credentials. Map your agent's messages into the exported `Transcript` model, or map events into `Event` and use the optional pure `reduce` / `reduceAll` helpers. `EMPTY_TRANSCRIPT` provides the initial state. Replace state immutably when streaming deltas arrive. Omit backend bookkeeping/tool events that should not be displayed; tool visibility does not depend on service names or code patterns.

- `adapter.send` resolves when a message is accepted. Return the ID used in its eventual transcript user turn; this removes the optimistic message without duplicating it. Return `queued: true` for a queued follow-up. Reject on failure to show retry controls. The UI supplies a unique `clientMessageId` for each attempt.
- `adapter.answer` resolves when an approval/question answer is accepted. Reject on failure to keep the card actionable. Throw `InteractionResolvedError` if it was already answered elsewhere, then deliver the authoritative resolution in the transcript.
- `stop`, `upload`, and `artifacts` are optional. Their controls are only offered when configured. `stop` should resolve when the stop request is acknowledged; update the transcript's state when the agent stops.
- `artifacts.url` supplies browser-usable preview/download URLs. Use signed URLs or cookie authentication for image/PDF previews; `loadText` allows custom authentication for text/Markdown/code/HTML. HTML previews are sandboxed.
- `state.loaded` defaults to true. Use false while initially loading. `loadError`, `notFound`, and `stream: "reconnecting"` render corresponding states. `adapter.reload` handles retrying a failed load.
- Change `sessionKey` when switching sessions to clear drafts, uploads, pending messages, interaction state, and open documents. Keep it stable while creating a new backend session from an existing draft.
- Provide a parent with a definite height. `className` and `style` apply to the instance root.

## Branding and styling

All identity is configured per instance through `branding`. The defaults are “Assistant,” a generic robot icon, and a neutral greeting. Suggestions are supplied by the host; none assume connected services. Each suggestion accepts an optional `icon: ReactNode`, for example `{ text: "Draft an email", icon: <MailIcon /> }`. Icons are sized and hidden from screen readers so the button label remains its text. Pass `null` to hide the avatar, greeting, tagline, or footer. Set `appearance="dark"` for the dark palette, or `appearance="system"` to follow the viewer's light/dark setting live. The empty-state greeting uses `--chat-font-heading` (defaults to the serif).

Theme variables are scoped to `.agent-chat-ui`; compiled CSS scopes resets, utilities, and prose styles to that root. Tooltip and document-menu portals remain inside the root to inherit its theme. The stylesheet includes its own generated utilities, so no host Tailwind source scanning is needed. Different instances can use different branding and themes. Hosts with competing utility rules should load this stylesheet after their base CSS.

Common theme variables: `--chat-background`, `--chat-foreground`, `--chat-surface`, `--chat-surface-2`, `--chat-primary`, `--chat-primary-foreground`, `--chat-accent`, `--chat-accent-soft`, `--chat-accent-foreground`, `--chat-ring`, `--chat-border`, `--chat-border-strong`, `--chat-muted`, `--chat-muted-foreground`, `--chat-font-sans`, `--chat-font-serif`, `--chat-font-mono`, and `--chat-shadow-card`. See `src/styles.css` for the full palette.

For a custom layout, exported primitives include `Composer`, `AssistantMessage`, `UserMessage`, `ApprovalCard`, `QuestionCard`, `DocumentsPanel`, and `Markdown`. Wrap them in `ChatProvider` for branding, theming, and tooltips; use `ChatContext.Provider` to supply interaction, retry, and artifact-open callbacks.

Public API: `src/index.ts`. Agent contract: `src/adapter.ts`. Display model: `src/model/`.
