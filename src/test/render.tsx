import type { InteractionAnswer } from "../model";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { ChatContext, type ChatActions } from "../components/chat/chat-context";
import { TooltipProvider } from "../components/ui/tooltip";

export function renderWithChat(ui: ReactElement, actions: Partial<ChatActions> = {}) {
  const value: ChatActions = {
    answer: async (_iid: string, _a: InteractionAnswer) => {},
    openArtifact: () => {},
    retry: () => {},
    ...actions,
  };
  const wrap = (node: ReactElement) => (
    <TooltipProvider>
      <ChatContext.Provider value={value}>{node}</ChatContext.Provider>
    </TooltipProvider>
  );
  const r = render(wrap(ui));
  return { ...r, rerender: (next: ReactElement) => r.rerender(wrap(next)) };
}

/** A promise with its resolve/reject exposed, to hold a POST open mid-test. */
export function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
