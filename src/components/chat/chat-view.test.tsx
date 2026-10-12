import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentChat } from "./chat-view";
import { EMPTY_TRANSCRIPT, type Transcript } from "../../model";
import type { AgentChatAdapter } from "../../adapter";
import { deferred } from "../../test/render";

vi.mock("../markdown", () => ({ Markdown: ({ text }: { text: string }) => <div>{text}</div>, CodeBlock: () => null }));
const adapter = (over: Partial<AgentChatAdapter> = {}): AgentChatAdapter => ({ send: vi.fn().mockResolvedValue({ messageId: "m1" }), answer: vi.fn().mockResolvedValue(undefined), ...over });
const empty = { transcript: EMPTY_TRANSCRIPT };

describe("AgentChat adapter boundary", () => {
  it("uses custom identity, suggestions, and per-instance theme", async () => {
    const a = adapter();
    const { container } = render(<AgentChat sessionKey="one" state={empty} adapter={a}
      branding={{ agentName: "Atlas", greeting: "Welcome", tagline: "Ask Atlas", footer: null }}
      theme={{ "--chat-accent": "#123456" }} suggestions={[{ text: "Plan a project" }]} />);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Message Atlas…")).toBeInTheDocument();
    expect(container.firstChild).toHaveStyle({ "--chat-accent": "#123456" });
    expect(screen.queryByRole("button", { name: "Attach files" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Plan a project" }));
    expect(a.send).toHaveBeenCalledWith(expect.objectContaining({ text: "Plan a project", attachments: [], clientMessageId: expect.any(String) }));
    expect(screen.queryByText(/can make mistakes/)).not.toBeInTheDocument();
  });

  it("shows a failed send, retries it, and absorbs the eventual transcript message", async () => {
    const a = adapter({ send: vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({ messageId: "m1" }) });
    const { rerender } = render(<AgentChat sessionKey="one" state={empty} adapter={a} />);
    await userEvent.type(screen.getByRole("textbox"), "Hello{Enter}");
    await screen.findByText(/Offline/);
    await userEvent.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() => expect(a.send).toHaveBeenCalledTimes(2));
    const transcript: Transcript = { ...EMPTY_TRANSCRIPT, items: [{ role: "user", message_id: "m1", text: "Hello", attachments: [], ts: new Date().toISOString() }] };
    rerender(<AgentChat sessionKey="one" state={{ transcript }} adapter={a} />);
    expect(screen.getAllByText("Hello")).toHaveLength(1);
  });

  it("resets drafts and ignores old async sends when the session changes", async () => {
    const pending = deferred<{ messageId: string }>();
    const a = adapter({ send: () => pending.promise });
    const { rerender } = render(<AgentChat sessionKey="one" state={empty} adapter={a} />);
    await userEvent.type(screen.getByRole("textbox"), "Old message{Enter}");
    await userEvent.type(screen.getByRole("textbox"), "Old draft");
    rerender(<AgentChat sessionKey="two" state={empty} adapter={adapter()} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
    pending.resolve({ messageId: "old" });
    await waitFor(() => expect(screen.queryByText("Old message")).not.toBeInTheDocument());
  });

  it("routes stop failures to a visible error", async () => {
    const a = adapter({ stop: vi.fn().mockRejectedValue(new Error("Stop failed")) });
    render(<AgentChat sessionKey="one" state={{ transcript: { ...EMPTY_TRANSCRIPT, state: "working" } }} adapter={a} />);
    await userEvent.click(screen.getByRole("button", { name: /^Stop$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stop failed");
    expect(a.stop).toHaveBeenCalledOnce();
  });

  it("does not allow sends while initial state is loading", () => {
    render(<AgentChat sessionKey="one" state={{ ...empty, loaded: false }} adapter={adapter()} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByLabelText("Loading conversation")).toBeInTheDocument();
  });

  it("keeps branding isolated between instances", () => {
    const { container } = render(<><AgentChat sessionKey="one" state={empty} adapter={adapter()} branding={{ agentName: "Atlas" }} /><AgentChat sessionKey="two" state={empty} adapter={adapter()} branding={{ agentName: "Nova" }} appearance="dark" /></>);
    const roots = container.querySelectorAll(".agent-chat-ui");
    expect(within(roots[0] as HTMLElement).getByRole("textbox")).toHaveAttribute("placeholder", "Message Atlas…");
    expect(within(roots[1] as HTMLElement).getByRole("textbox")).toHaveAttribute("placeholder", "Message Nova…");
    expect(roots[0]).not.toHaveClass("dark");
    expect(roots[1]).toHaveClass("dark");
  });
});
