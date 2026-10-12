import type { InteractionPart } from "../model";
import { describe, expect, it } from "vitest";

import {
  approvalAnswer,
  choiceOf,
  describeAction,
  describeResolution,
  initialInteractionState,
  interactionReducer,
  type InteractionUiState,
} from "./interactions";

const approve = approvalAnswer("once");
const part = (over: Partial<InteractionPart> = {}): InteractionPart => ({ type: "interaction", interaction_id: "i1", kind: "approve", title: "Send?", ...over });

describe("interaction state machine", () => {
  it("pending → submitting → resolved", () => {
    let s: InteractionUiState = initialInteractionState(part());
    expect(s).toEqual({ status: "pending" });
    s = interactionReducer(s, { type: "submit", answer: approve });
    expect(s).toEqual({ status: "submitting", answer: approve });
    s = interactionReducer(s, { type: "succeeded" });
    expect(s).toEqual({ status: "resolved", answer: approve, by: "user" });
  });

  it("submitting → failed returns to pending with the error, and can be submitted again", () => {
    let s: InteractionUiState = interactionReducer({ status: "pending" }, { type: "submit", answer: approve });
    s = interactionReducer(s, { type: "failed", message: "gateway hiccup" });
    expect(s).toEqual({ status: "pending", error: "gateway hiccup" });
    s = interactionReducer(s, { type: "submit", answer: approvalAnswer("deny") });
    expect(s.status).toBe("submitting");
  });

  it("a second submit while submitting is ignored (no double POST)", () => {
    const s = interactionReducer({ status: "submitting", answer: approve }, { type: "submit", answer: approvalAnswer("deny") });
    expect(s).toEqual({ status: "submitting", answer: approve });
  });

  it("409 already-resolved keeps the user's choice on screen", () => {
    const s = interactionReducer({ status: "submitting", answer: approve }, { type: "already_resolved" });
    expect(s).toEqual({ status: "resolved", answer: approve, by: "user" });
  });

  it("the server's resolution wins from any state", () => {
    const deny = approvalAnswer("deny");
    for (const from of [{ status: "pending" }, { status: "submitting", answer: approve }, { status: "resolved", answer: approve, by: "user" }] as InteractionUiState[]) {
      expect(interactionReducer(from, { type: "server_resolved", answer: deny, by: "timeout" })).toEqual({ status: "resolved", answer: deny, by: "timeout" });
    }
  });

  it("late success/failure events after resolution are ignored", () => {
    const resolved: InteractionUiState = { status: "resolved", answer: approve, by: "stopped" };
    expect(interactionReducer(resolved, { type: "succeeded" })).toBe(resolved);
    expect(interactionReducer(resolved, { type: "failed", message: "x" })).toBe(resolved);
    expect(interactionReducer(resolved, { type: "submit", answer: approve })).toBe(resolved);
  });

  it("starts resolved when the transcript already has the answer (reload)", () => {
    expect(initialInteractionState(part({ answer: approve, resolved_by: "user" }))).toEqual({ status: "resolved", answer: approve, by: "user" });
  });
});

describe("approval answers", () => {
  it("maps the three buttons onto InteractionAnswer and back", () => {
    expect(approvalAnswer("once")).toEqual({ kind: "approve", approved: true });
    expect(approvalAnswer("always")).toEqual({ kind: "approve", approved: true, remember: true });
    expect(approvalAnswer("deny")).toEqual({ kind: "approve", approved: false });
    for (const c of ["once", "always", "deny"] as const) expect(choiceOf(approvalAnswer(c))).toBe(c);
    expect(choiceOf({ kind: "question", selected_ids: [] })).toBeNull();
  });
});

describe("describeResolution", () => {
  const q = part({ kind: "question", options: [{ id: "1", label: "Work" }, { id: "2", label: "Personal" }] });
  it("approvals", () => {
    expect(describeResolution(approvalAnswer("once"), "user")).toBe("Allowed once");
    expect(describeResolution(approvalAnswer("always"), "user")).toBe("Always allowed in this chat");
    expect(describeResolution(approvalAnswer("deny"), "user")).toBe("Denied");
    expect(describeResolution(approvalAnswer("deny"), "timeout")).toMatch(/Timed out/);
    expect(describeResolution(approvalAnswer("deny"), "stopped")).toMatch(/Cancelled/);
  });
  it("questions show the chosen labels (1-based ids) and free text, not just 'answered'", () => {
    expect(describeResolution({ kind: "question", selected_ids: ["2"] }, "user", q)).toBe("Personal");
    expect(describeResolution({ kind: "question", selected_ids: ["1", "2"], text: "and gym" }, "user", q)).toBe("Work, Personal, “and gym”");
    expect(describeResolution({ kind: "question", text: "Only mornings" }, "user", q)).toBe("“Only mornings”");
    expect(describeResolution({ kind: "question", selected_ids: ["9"] }, "user", q)).toBe("9");
    expect(describeResolution({ kind: "question" }, "user", q)).toBe("Answered");
  });
});

describe("describeAction", () => {
  it("gmail_send reply: recipients, subject, thread and body preview", () => {
    const d = describeAction({
      server: "google",
      tool: "gmail_send",
      args: { to: ["priya@example.com", "sam@example.com"], cc: ["boss@example.com"], subject: "Re: Offsite", body: "Works for me.", reply_to_message_id: "m1" },
    })!;
    expect(d.verb).toBe("Send a reply");
    expect(d.icon).toBe("mail");
    expect(d.target).toBe("To priya@example.com, sam@example.com · Re: Offsite");
    expect(d.fields.map((f) => f.label)).toEqual(["To", "Cc", "Subject", "Thread", "Message"]);
    expect(d.technical).toBe("google.gmail_send");
  });

  it("gmail_create_draft with an empty reply subject", () => {
    const d = describeAction({ server: "google", tool: "gmail_create_draft", args: { to: ["a@x.com"], subject: "", body: "x", reply_to_message_id: "m" } })!;
    expect(d.verb).toBe("Save an email draft");
    expect(d.fields.find((f) => f.label === "Subject")?.value).toBe("Re: (original subject)");
  });

  it("long bodies are previewed, not dumped", () => {
    const d = describeAction({ server: "google", tool: "gmail_send", args: { to: ["a@x.com"], subject: "s", body: "x".repeat(5000) } })!;
    const body = d.fields.find((f) => f.label === "Message")!;
    expect(body.value.length).toBeLessThan(1600);
    expect(body.value.endsWith("…")).toBe(true);
    expect(body.multiline).toBe(true);
  });

  it("calendar_create_event: title, time, guests, Meet", () => {
    const d = describeAction({
      server: "google",
      tool: "calendar_create_event",
      args: { summary: "Design sync", start: "2026-09-29T14:00:00-07:00", end: "2026-09-29T14:30:00-07:00", attendees: ["p@x.com"], add_video_call: true, time_zone: "America/Los_Angeles", location: "Room 4" },
    })!;
    expect(d.verb).toBe("Create a calendar event");
    expect(d.icon).toBe("calendar");
    expect(d.target).toContain("Design sync");
    const labels = Object.fromEntries(d.fields.map((f) => [f.label, f.value]));
    expect(labels.Title).toBe("Design sync");
    expect(labels.When).toMatch(/America\/Los_Angeles/);
    expect(labels.Guests).toBe("p@x.com");
    expect(labels.Where).toBe("Room 4");
    expect(labels.Video).toBe("A Google Meet link will be added");
  });

  it("all-day events and unparseable times degrade gracefully", () => {
    const allDay = describeAction({ server: "google", tool: "calendar_create_event", args: { summary: "Offsite", start: "2026-10-03", end: "2026-10-04" } })!;
    expect(allDay.fields.find((f) => f.label === "When")?.value).toMatch(/all day/);
    const odd = describeAction({ server: "google", tool: "calendar_create_event", args: { summary: "X", start: "tomorrow 3pm", end: "tomorrow 4pm" } })!;
    expect(odd.fields.find((f) => f.label === "When")?.value).toBe("tomorrow 3pm – tomorrow 4pm");
  });

  it("unknown tools list every argument", () => {
    const d = describeAction({ server: "crm", tool: "update_deal", args: { deal_id: 42, stage: "won", notes: { a: 1 } } })!;
    expect(d.verb).toBe("Update deal");
    expect(d.fields.map((f) => f.label)).toEqual(["Deal id", "Stage", "Notes"]);
    expect(d.fields[2]!.value).toBe('{"a":1}');
  });

  it("no action → null", () => {
    expect(describeAction(undefined)).toBeNull();
  });

  describe("Drive", () => {
    const target = { id: "d1", name: "Q3 plan", mime_type: "application/vnd.google-apps.spreadsheet", owners: ["a@x.com", "b@x.com"] };
    const labels = (d: ReturnType<typeof describeAction>) => Object.fromEntries(d!.fields.map((f) => [f.label, f.value]));

    it("drive_share lists file, person, access and notification", () => {
      const d = describeAction({ server: "google", tool: "drive_share", args: { file_id: "d1", email: "ana@x.com", role: "commenter", notify: false, message: "ignored" }, context: { target } })!;
      expect(d.verb).toBe("Share a Drive file");
      expect(d.icon).toBe("file");
      expect(d.target).toBe("Q3 plan · ana@x.com (can comment)");
      expect(labels(d)).toEqual({ File: "Q3 plan", Type: "Google Sheet", Owner: "a@x.com, b@x.com", With: "ana@x.com", Access: "Can comment", Notify: "No email" });
    });

    it("drive_share falls back to the id and a humanised role", () => {
      const d = describeAction({ server: "google", tool: "drive_share", args: { file_id: "zz", email: "ana@x.com", role: "owner" } })!;
      expect(labels(d).File).toBe("File zz");
      expect(labels(d).Access).toBe("Owner");
      expect(labels(d).Notify).toBe("Google emails them a link");
    });

    it("drive_trash names the file and the undo", () => {
      const d = describeAction({ server: "google", tool: "drive_trash", args: { file_id: "d1" }, context: { target } })!;
      expect(d.verb).toBe("Move a file to the Drive trash");
      expect(d.target).toBe("Q3 plan");
      expect(labels(d).Undo).toMatch(/30 days/);
    });

    it("drive_update_content previews long markdown without dumping it", () => {
      const d = describeAction({ server: "google", tool: "drive_update_content", args: { file_id: "d1", markdown: "y".repeat(4000) }, context: { target } })!;
      const content = d.fields.find((f) => f.label === "New content")!;
      expect(content.multiline).toBe(true);
      expect(content.value.length).toBeLessThan(1600);
    });

    it("drive_update_content from a binary file shows its size and no preview", () => {
      const files = { path: { path: "outputs/model.xlsx", name: "model.xlsx", size: 3 * 1024 * 1024, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } };
      const d = describeAction({ server: "google", tool: "drive_update_content", args: { file_id: "d1", path: "outputs/model.xlsx" }, context: { target, files } })!;
      expect(labels(d).From).toBe("model.xlsx (3.0 MB)");
      expect(labels(d).Preview).toBeUndefined();
    });

    it("other servers' tools with the same names keep the generic renderer", () => {
      const d = describeAction({ server: "crm", tool: "drive_trash", args: { file_id: "d1" } })!;
      expect(d.verb).toBe("Drive trash");
    });
  });
});
