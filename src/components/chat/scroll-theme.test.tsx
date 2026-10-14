import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentChat } from "./chat-view";
import { EMPTY_TRANSCRIPT, type Transcript } from "../../model";
import type { AgentChatAdapter } from "../../adapter";

vi.mock("../markdown", () => ({ Markdown: ({ text }: { text: string }) => <div>{text}</div>, CodeBlock: () => null }));
const adapter: AgentChatAdapter = { send: vi.fn().mockResolvedValue({ messageId: "m1" }), answer: vi.fn().mockResolvedValue(undefined) };
const transcript: Transcript = { ...EMPTY_TRANSCRIPT, items: [{ role: "user", message_id: "m1", text: "Hello", attachments: [], ts: new Date().toISOString() }] };

/** jsdom has no layout: give the scroller a size and a movable scrollTop. */
function sized(el: HTMLElement, height: { scroll: number; client: number }) {
  let top = 0;
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => height.scroll });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => height.client });
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => top, set: (v: number) => (top = Math.min(v, height.scroll - height.client)) });
  return { at: () => top, set: (v: number) => (top = v) };
}

afterEach(() => vi.restoreAllMocks());

describe("thread pinning", () => {
  it("a scroll the reader didn't make (layout reflow) keeps the thread pinned to the bottom", () => {
    render(<AgentChat sessionKey="s" state={{ transcript }} adapter={adapter} />);
    const el = screen.getByTestId("thread");
    const h = { scroll: 2000, client: 500 };
    const pos = sized(el, h);
    pos.set(1500); // at the bottom
    h.scroll = 3000; // a big chunk of reply lands; the browser fires a scroll without the reader
    act(() => void fireEvent.scroll(el));
    expect(pos.at()).toBe(2500); // re-pinned, not stranded
    expect(screen.queryByRole("button", { name: /latest/i })).not.toBeInTheDocument();
  });

  it("the reader scrolling up (wheel) unpins it; the Latest button appears", () => {
    render(<AgentChat sessionKey="s" state={{ transcript }} adapter={adapter} />);
    const el = screen.getByTestId("thread");
    const pos = sized(el, { scroll: 2000, client: 500 });
    pos.set(1500);
    act(() => {
      fireEvent.wheel(el, { deltaY: -400 });
      pos.set(1000);
      fireEvent.scroll(el);
    });
    expect(pos.at()).toBe(1000);
    expect(screen.getByRole("button", { name: /latest/i })).toBeInTheDocument();
  });
});

describe("appearance", () => {
  function mockScheme(dark: boolean) {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const mq = {
      matches: dark,
      media: "(prefers-color-scheme: dark)",
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => mq));
    return (next: boolean) => {
      mq.matches = next;
      for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent);
    };
  }

  it('"system" follows the viewer\'s light/dark setting, live', () => {
    const flip = mockScheme(true);
    const { container } = render(<AgentChat sessionKey="s" state={{ transcript: EMPTY_TRANSCRIPT }} adapter={adapter} appearance="system" />);
    const root = container.querySelector(".agent-chat-ui")!;
    expect(root).toHaveClass("dark");
    act(() => flip(false));
    expect(root).not.toHaveClass("dark");
  });

  it("the greeting uses the heading font variable, not a hard-coded serif", () => {
    render(<AgentChat sessionKey="s" state={{ transcript: EMPTY_TRANSCRIPT }} adapter={adapter} branding={{ greeting: "Hi" }} />);
    expect(screen.getByText("Hi")).toHaveClass("font-heading");
  });
});
