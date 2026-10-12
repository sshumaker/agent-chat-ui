import type { InteractionPart } from "../../model";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithChat } from "../../test/render";

import { QuestionCard } from "./question-card";

const base: InteractionPart = {
  type: "interaction",
  interaction_id: "q1",
  kind: "question",
  title: "Which calendar?",
  options: [
    { id: "1", label: "Work", description: "alex@acme.com" },
    { id: "2", label: "Personal" },
    { id: "3", label: "Both" },
  ],
};

describe("QuestionCard", () => {
  it("single-select without free text answers on click", async () => {
    const answer = vi.fn(async () => {});
    renderWithChat(<QuestionCard part={base} />, { answer });
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Personal/ }));
    expect(answer).toHaveBeenCalledWith("q1", { kind: "question", selected_ids: ["2"] });
    await waitFor(() => expect(screen.getByTestId("question-resolution")).toHaveTextContent("You answered: Personal"));
  });

  it("multi-select toggles, then submits the chosen ids with free text", async () => {
    const answer = vi.fn(async () => {});
    renderWithChat(<QuestionCard part={{ ...base, allow_multiple: true, allow_free_text: true }} />, { answer });
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Work/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Both/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Work/ }));
    expect(screen.getByRole("checkbox", { name: /Both/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.type(screen.getByRole("textbox", { name: "Your answer" }), "plus the team one");
    await userEvent.click(submit);
    expect(answer).toHaveBeenCalledWith("q1", { kind: "question", selected_ids: ["3"], text: "plus the team one" });
    await waitFor(() => expect(screen.getByTestId("question-resolution")).toHaveTextContent("Both, “plus the team one”"));
  });

  it("free text only (no options) submits with Enter", async () => {
    const answer = vi.fn(async () => {});
    renderWithChat(<QuestionCard part={{ ...base, options: [], title: "What's the budget?" }} />, { answer });
    await userEvent.type(screen.getByRole("textbox", { name: "Your answer" }), "$20k{Enter}");
    expect(answer).toHaveBeenCalledWith("q1", { kind: "question", selected_ids: undefined, text: "$20k" });
  });

  it("a failed POST shows an error and keeps the options usable", async () => {
    const answer = vi.fn().mockRejectedValueOnce(new Error("offline"));
    renderWithChat(<QuestionCard part={base} />, { answer });
    await userEvent.click(screen.getByRole("radio", { name: /Work/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("offline"));
    expect(screen.getByRole("radio", { name: /Work/ })).toBeEnabled();
  });

  it("a resolved question shows the chosen answer, not just 'answered'", () => {
    renderWithChat(<QuestionCard part={{ ...base, answer: { kind: "question", selected_ids: ["1"] }, resolved_by: "user" }} />);
    expect(screen.getByTestId("question-resolution")).toHaveTextContent("Work");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("a timed-out question says so", () => {
    renderWithChat(<QuestionCard part={{ ...base, answer: { kind: "question", selected_ids: [] }, resolved_by: "timeout" }} />);
    expect(screen.getByTestId("question-resolution")).toHaveTextContent("Timed out");
  });
});
