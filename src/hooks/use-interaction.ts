"use client";

import type { InteractionAnswer, InteractionPart } from "../model";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { InteractionResolvedError } from "../adapter";
import { initialInteractionState, interactionReducer, type InteractionUiState } from "../lib/interactions";

/**
 * Drives one interaction card through the state machine in lib/interactions. The card
 * owns its POST; the transcript's `interaction_resolved` is folded in whenever it lands.
 */
export function useInteraction(
  part: InteractionPart,
  submit: (interactionId: string, answer: InteractionAnswer) => Promise<void>,
): { state: InteractionUiState; send: (answer: InteractionAnswer) => Promise<void> } {
  const [state, dispatch] = useReducer(interactionReducer, part, initialInteractionState);
  const inFlight = useRef(false);

  useEffect(() => {
    if (part.answer && part.resolved_by) dispatch({ type: "server_resolved", answer: part.answer, by: part.resolved_by });
  }, [part.answer, part.resolved_by]);

  const send = useCallback(
    async (answer: InteractionAnswer) => {
      if (inFlight.current || state.status !== "pending") return;
      inFlight.current = true;
      dispatch({ type: "submit", answer });
      try {
        await submit(part.interaction_id, answer);
        dispatch({ type: "succeeded" });
      } catch (e) {
        if (e instanceof InteractionResolvedError) dispatch({ type: "already_resolved" });
        else dispatch({ type: "failed", message: (e as Error).message || "Something went wrong" });
      } finally {
        inFlight.current = false;
      }
    },
    [part.interaction_id, state.status, submit],
  );

  return { state, send };
}
