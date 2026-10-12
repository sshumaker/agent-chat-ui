"use client";

import type { InteractionAnswer } from "../../model";
import { createContext, useContext } from "react";

export interface ChatActions {
  answer: (interactionId: string, answer: InteractionAnswer) => Promise<void>;
  openArtifact: (artifactId: string) => void;
  retry: () => void;
}

const noop = async () => {};

export const ChatContext = createContext<ChatActions>({
  answer: noop,
  openArtifact: () => {},
  retry: () => {},
});

export const useChatActions = () => useContext(ChatContext);
