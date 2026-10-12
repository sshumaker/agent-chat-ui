"use client";

import type { InteractionPart } from "../../model";
import { AlertCircleIcon, CheckIcon, MessageCircleQuestionIcon, SendHorizontalIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { useInteraction } from "../../hooks/use-interaction";
import { describeResolution } from "../../lib/interactions";
import { cn } from "../../lib/utils";
import { humanizeName } from "../../lib/view-model";

import { useChatActions } from "./chat-context";

/**
 * A clarifying question. Single-select without free text answers on click; otherwise the
 * user picks (one or many) and/or types, then submits.
 */
export function QuestionCard({ part }: { part: InteractionPart }) {
  const { answer } = useChatActions();
  const { state, send } = useInteraction(part, answer);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const options = part.options ?? [];
  const multi = Boolean(part.allow_multiple);
  const freeText = Boolean(part.allow_free_text) || options.length === 0;
  const instant = !multi && !freeText;
  const submitting = state.status === "submitting";
  const resolved = state.status === "resolved";

  const toggle = (id: string) => {
    if (instant) return void send({ kind: "question", selected_ids: [id] });
    setSelected((cur) => (multi ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : cur[0] === id ? [] : [id]));
  };
  const canSubmit = selected.length > 0 || text.trim().length > 0;
  const submit = () => {
    if (!canSubmit) return;
    void send({ kind: "question", selected_ids: selected.length ? selected : undefined, text: text.trim() || undefined });
  };

  const shownSelection = state.status === "submitting" && state.answer.kind === "question" ? state.answer.selected_ids ?? [] : selected;

  return (
    <section
      role="group"
      aria-label={`Question: ${part.title}`}
      data-testid="question-card"
      data-state={state.status}
      className={cn("my-3 rounded-2xl border bg-surface shadow-card animate-rise", resolved ? "border-border" : "border-accent/40 ring-4 ring-accent-soft")}
    >
      <header className="flex items-start gap-3 px-4 pt-4 pb-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", resolved ? "bg-muted text-muted-foreground" : "bg-accent-soft text-accent")}>
          <MessageCircleQuestionIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">{part.title}</h3>
          {part.child_name ? (
            <p className="mt-0.5 text-xs text-faint" data-testid="interaction-from-child">
              Requested by subagent {humanizeName(part.child_name)}
            </p>
          ) : null}
          {part.body && !resolved ? <p className="mt-0.5 text-sm text-muted-foreground">{part.body}</p> : null}
          {!resolved && multi ? <p className="mt-0.5 text-xs text-faint">Choose all that apply</p> : null}
        </div>
      </header>

      {resolved ? (
        <p className="flex items-start gap-1.5 border-t border-border px-4 py-2.5 text-sm" data-testid="question-resolution">
          <CheckIcon className={cn("mt-0.5 size-4 shrink-0", state.by === "user" ? "text-success" : "text-muted-foreground")} />
          <span>
            {state.by === "user" ? <span className="text-muted-foreground">You answered: </span> : null}
            <span className="font-medium">{describeResolution(state.answer, state.by, part)}</span>
          </span>
        </p>
      ) : (
        <div className="px-4 pb-4">
          {options.length > 0 ? (
            <div role={multi ? "group" : "radiogroup"} aria-label="Options" className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
              {options.map((o) => {
                const on = shownSelection.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    role={multi ? "checkbox" : "radio"}
                    aria-checked={on}
                    disabled={submitting}
                    onClick={() => toggle(o.id)}
                    className={cn(
                      "group flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60",
                      on ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent/60 hover:bg-surface-2",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors",
                        multi ? "rounded" : "rounded-full",
                        on ? "border-accent bg-accent text-white" : "border-border-strong bg-surface",
                      )}
                    >
                      {on ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{o.label}</span>
                      {o.description ? <span className="block text-xs text-muted-foreground">{o.description}</span> : null}
                    </span>
                    {submitting && on && instant ? <Spinner className="ml-auto" decorative /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {freeText ? (
            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={submitting}
                placeholder={options.length ? "Or type your own answer…" : "Type your answer…"}
                aria-label="Your answer"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none placeholder:text-faint focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft"
              />
              <Button type="submit" size="sm" disabled={!canSubmit || submitting}>
                {submitting ? <Spinner className="text-primary-foreground" decorative /> : <SendHorizontalIcon />}
                Submit
              </Button>
            </form>
          ) : !instant ? (
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={submit} disabled={!canSubmit || submitting}>
                {submitting ? <Spinner className="text-primary-foreground" decorative /> : null}
                Submit
              </Button>
            </div>
          ) : null}

          {state.status === "pending" && state.error ? (
            <p role="alert" className="mt-2.5 flex items-center gap-1.5 text-sm text-danger">
              <AlertCircleIcon className="size-4 shrink-0" /> Couldn&apos;t send your answer — {state.error}. Try again.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
