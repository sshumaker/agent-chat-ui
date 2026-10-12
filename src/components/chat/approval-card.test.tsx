import type { InteractionPart } from "../../model";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InteractionResolvedError } from "../../adapter";
import { deferred, renderWithChat } from "../../test/render";

import { ApprovalCard } from "./approval-card";

const part: InteractionPart = {
  type: "interaction",
  interaction_id: "ix1",
  kind: "approve",
  title: "Send this email?",
  action: { server: "google", tool: "gmail_send", args: { to: ["priya@example.com"], subject: "Re: Offsite", body: "Thursday works." } },
};

const card = () => screen.getByTestId("approval-card");

describe("ApprovalCard", () => {
  it("shows the action and its target", () => {
    renderWithChat(<ApprovalCard part={part} />);
    expect(screen.getByRole("heading", { name: "Send an email" })).toBeInTheDocument();
    expect(card()).toHaveTextContent("priya@example.com");
    expect(card()).toHaveTextContent("Re: Offsite");
    expect(card()).toHaveTextContent("Thursday works.");
    expect(card()).toHaveTextContent("google.gmail_send");
    expect(card()).toHaveAttribute("data-state", "pending");
  });

  it("pending → submitting → resolved on Allow once, and stays visible", async () => {
    const d = deferred();
    const answer = vi.fn(() => d.promise);
    renderWithChat(<ApprovalCard part={part} />, { answer });
    await userEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(answer).toHaveBeenCalledWith("ix1", { kind: "approve", approved: true });
    expect(card()).toHaveAttribute("data-state", "submitting");
    for (const name of ["Allow once", "Always allow in this chat", "Deny"]) expect(screen.getByRole("button", { name })).toBeDisabled();
    await act(async () => d.resolve());
    expect(card()).toHaveAttribute("data-state", "resolved");
    expect(screen.getByTestId("approval-resolution")).toHaveTextContent("Allowed once");
    expect(screen.queryByRole("button", { name: "Allow once" })).not.toBeInTheDocument();
  });

  it("submitting → error → pending: a failed POST keeps the card actionable", async () => {
    const answer = vi.fn().mockRejectedValueOnce(new Error("gateway hiccup")).mockResolvedValueOnce(undefined);
    renderWithChat(<ApprovalCard part={part} />, { answer });
    await userEvent.click(screen.getByRole("button", { name: "Deny" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-state", "pending"));
    expect(screen.getByRole("alert")).toHaveTextContent("gateway hiccup");
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Always allow in this chat" }));
    await waitFor(() => expect(screen.getByTestId("approval-resolution")).toHaveTextContent("Always allowed in this chat"));
    expect(answer).toHaveBeenLastCalledWith("ix1", { kind: "approve", approved: true, remember: true });
  });

  it("a 409 (already resolved elsewhere) resolves rather than erroring", async () => {
    const answer = vi.fn().mockRejectedValue(new InteractionResolvedError());
    renderWithChat(<ApprovalCard part={part} />, { answer });
    await userEvent.click(screen.getByRole("button", { name: "Allow once" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-state", "resolved"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("double clicks send one POST", async () => {
    const d = deferred();
    const answer = vi.fn(() => d.promise);
    renderWithChat(<ApprovalCard part={part} />, { answer });
    const btn = screen.getByRole("button", { name: "Allow once" });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(answer).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve());
  });

  it("the server's resolution (e.g. stop) resolves the card, and reload renders it resolved", () => {
    const { rerender } = renderWithChat(<ApprovalCard part={part} />);
    rerender(<ApprovalCard part={{ ...part, answer: { kind: "approve", approved: false }, resolved_by: "stopped" }} />);
    expect(screen.getByTestId("approval-resolution")).toHaveTextContent("Cancelled when the task was stopped");
  });

  it("resolved cards can re-open their details", async () => {
    renderWithChat(<ApprovalCard part={{ ...part, answer: { kind: "approve", approved: true }, resolved_by: "user" }} />);
    expect(card()).not.toHaveTextContent("Thursday works.");
    await userEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(card()).toHaveTextContent("Thursday works.");
  });

  it("renders a calendar event with guests and Meet", () => {
    renderWithChat(
      <ApprovalCard
        part={{
          ...part,
          action: { server: "google", tool: "calendar_create_event", args: { summary: "Design sync", start: "2026-09-29T14:00:00Z", end: "2026-09-29T14:30:00Z", attendees: ["p@x.com"], add_video_call: true } },
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Create a calendar event" })).toBeInTheDocument();
    expect(card()).toHaveTextContent("Design sync");
    expect(card()).toHaveTextContent("p@x.com");
    expect(card()).toHaveTextContent("A Google Meet link will be added");
  });

  describe("Drive approvals", () => {
    const doc = { id: "d1", name: "Q3 plan", mime_type: "application/vnd.google-apps.document", owners: ["scott@example.com"] };
    const drivePart = (tool: string, args: Record<string, unknown>, context?: NonNullable<InteractionPart["action"]>["context"]): InteractionPart => ({
      type: "interaction",
      interaction_id: `ix-${tool}`,
      kind: "approve",
      title: "?",
      action: { server: "google", tool, args, ...(context ? { context } : {}) },
    });

    it("share: who, which access, which file", () => {
      renderWithChat(<ApprovalCard part={drivePart("drive_share", { file_id: "d1", email: "ana@example.com", role: "writer", message: "Take a look" }, { target: doc })} />);
      expect(screen.getByRole("heading", { name: "Share a Drive file" })).toBeInTheDocument();
      expect(card()).toHaveTextContent("Q3 plan · ana@example.com (can edit)");
      expect(card()).toHaveTextContent("Google Doc");
      expect(card()).toHaveTextContent("Can edit");
      expect(card()).toHaveTextContent("Google emails them a link");
      expect(card()).toHaveTextContent("Take a look");
      expect(card()).toHaveTextContent("google.drive_share");
      expect(screen.getByRole("button", { name: "Allow once" })).toBeEnabled();
    });

    it("trash: which file, and how to undo it", () => {
      renderWithChat(<ApprovalCard part={drivePart("drive_trash", { file_id: "d1" }, { target: doc })} />);
      expect(screen.getByRole("heading", { name: "Move a file to the Drive trash" })).toBeInTheDocument();
      expect(card()).toHaveTextContent("Q3 plan");
      expect(card()).toHaveTextContent("scott@example.com");
      expect(card()).toHaveTextContent("within 30 days");
    });

    it("update: which file, with a preview of the new content", () => {
      renderWithChat(<ApprovalCard part={drivePart("drive_update_content", { file_id: "d1", markdown: "# Q3 plan\n\nHire two engineers." }, { target: doc })} />);
      expect(screen.getByRole("heading", { name: "Replace a Drive file's content" })).toBeInTheDocument();
      expect(card()).toHaveTextContent("Q3 plan");
      expect(card()).toHaveTextContent("Hire two engineers.");
    });

    it("update from a workspace file shows its name, size and a preview", () => {
      const files = { path: { path: "outputs/plan.md", name: "plan.md", size: 2048, mime: "text/markdown", preview: "# Plan v2" } };
      renderWithChat(<ApprovalCard part={drivePart("drive_update_content", { file_id: "d1", path: "outputs/plan.md" }, { target: doc, files })} />);
      expect(card()).toHaveTextContent("plan.md (2 KB)");
      expect(card()).toHaveTextContent("# Plan v2");
    });

    it("without the looked-up name, the card still names the file by id", () => {
      renderWithChat(<ApprovalCard part={drivePart("drive_trash", { file_id: "1AbC" })} />);
      expect(card()).toHaveTextContent("File 1AbC");
    });

    it("once resolved, the details fold away but stay reachable", async () => {
      const p = { ...drivePart("drive_share", { file_id: "d1", email: "ana@example.com", role: "reader" }, { target: doc }), answer: { kind: "approve" as const, approved: true }, resolved_by: "user" as const };
      renderWithChat(<ApprovalCard part={p} />);
      expect(screen.getByTestId("approval-resolution")).toHaveTextContent("Allowed once");
      expect(card()).not.toHaveTextContent("Can view");
      await userEvent.click(screen.getByRole("button", { name: /Details/ }));
      expect(card()).toHaveTextContent("Can view");
    });
  });
});
