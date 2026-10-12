import { EMPTY_TRANSCRIPT, reduce, type EventBody, type InteractionAnswer, type Transcript } from "../src";

export type ScenarioId = "email" | "tools" | "files" | "question" | "home";
export const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: "email", label: "Email approval" },
  { id: "tools", label: "Tools & code" },
  { id: "files", label: "Files & subagents" },
  { id: "question", label: "Question" },
];
export const BRIEF = `# Launch brief\n\n## Recommendation\nShip a focused pilot to 20 teams, then expand after one week of feedback.\n\n| Milestone | Owner | Target |\n| --- | --- | --- |\n| Pilot invitations | Maya | Monday |\n| Onboarding review | Jordan | Wednesday |\n| Feedback summary | Alex | Friday |\n\n## Success criteria\n- 80% of invited teams finish onboarding.\n- Median time to first useful result stays under 5 minutes.\n- No unresolved critical bugs.\n\n## Next steps\n1. Review the invitation email.\n2. Confirm the pilot list.\n3. Schedule a short feedback session.\n\n*Sample document generated locally by the demo.*\n`;
export const CSV = "week,active_teams,tasks_completed\n1,12,48\n2,18,91\n3,24,156\n";
export const EMAIL_BODY = "Hi Maya,\n\nI pulled together the launch brief and suggest starting with a small pilot next Monday. The plan covers invitations, onboarding, and a feedback review at the end of the week.\n\nCould you review the brief and confirm the pilot list by Friday?\n\nThanks,\nAlex";
const usage = { input_tokens: 1840, output_tokens: 620, cache_read_tokens: 960, cost_usd: 0.0124 };
const tool = (id: string, label: string, server: string, name: string, result: string): EventBody => ({
  type: "tool_call", call_id: id, server, tool: name, label, args_preview: '{"project":"pilot-launch"}', status: "done", result_preview: result,
});

export function append(t: Transcript, ...bodies: EventBody[]): Transcript {
  return bodies.reduce((next, body) => reduce(next, { ...body, seq: next.last_seq + 1, ts: new Date().toISOString() }), t);
}

export function scenarioEvents(id: ScenarioId): EventBody[] {
  if (id === "home") return [];
  const prompts = {
    email: "Read Maya’s latest note and draft a reply about the pilot launch. Let me review it before sending.",
    tools: "Check the pilot metrics and calculate how fast completed tasks are growing.",
    files: "Research the launch plan and prepare a brief I can share with the team.",
    question: "Help me organize the pilot kickoff.",
  };
  const start: EventBody[] = [
    { type: "title", title: SCENARIOS.find((s) => s.id === id)!.label },
    { type: "user_message", message_id: "demo-user", text: prompts[id], attachments: [] },
    { type: "turn_started", turn_id: "demo-turn" },
    { type: "state", state: "working" },
  ];
  if (id === "email") return [...start,
    { type: "tool_call", call_id: "read-email", server: "mail", tool: "read_thread", label: "Reading Maya’s latest email", args_preview: '{"from":"maya@example.com","subject":"Pilot launch"}', status: "started" },
    tool("read-email", "Reading Maya’s latest email", "mail", "read_thread", "Maya asked for the proposed schedule and pilot review deadline."),
    { type: "text_delta", message_id: "intro", delta: "Maya asked about timing. " },
    { type: "message_done", message_id: "intro", text: "Maya asked about timing. I drafted a reply with the proposed schedule and a clear next step. Review the email below." },
    { type: "interaction_requested", interaction_id: "email-approval", kind: "approve", title: "Send the launch email", body: "Demo action — approving updates this preview; no email is sent.", action: { server: "mail", tool: "send_email", args: { to: ["maya@example.com"], cc: ["jordan@example.com"], subject: "Pilot launch — proposed schedule", body: EMAIL_BODY } } },
    { type: "state", state: "waiting_for_user" },
  ];
  if (id === "question") return [...start,
    tool("calendar", "Checking team availability", "calendar", "list_events", "Two shared openings: Monday 10:00 AM and Tuesday 2:00 PM."),
    { type: "message_done", message_id: "intro", text: "I found two times that work for the team. Which should I use for the kickoff?" },
    { type: "interaction_requested", interaction_id: "kickoff-time", kind: "question", title: "Choose a kickoff time", body: "Pick a time, or suggest something else.", options: [{ id: "monday", label: "Monday, 10:00 AM", description: "Start the week with a 30-minute kickoff." }, { id: "tuesday", label: "Tuesday, 2:00 PM", description: "Leave Monday for reviewing the brief." }], allow_free_text: true },
    { type: "state", state: "waiting_for_user" },
  ];
  if (id === "tools") return [...start,
    { type: "thinking_started", message_id: "thinking" },
    { type: "thinking_delta", message_id: "thinking", delta: "I’ll compare the weekly totals and check whether growth is accelerating." },
    { type: "tool_call", call_id: "metrics", server: "analytics", tool: "query", label: "Fetching pilot metrics", args_preview: '{"dataset":"pilot_weekly","weeks":3}', status: "started" },
    tool("metrics", "Fetching pilot metrics", "analytics", "query", "Week 1: 48 tasks · Week 2: 91 tasks · Week 3: 156 tasks"),
    { type: "step_started", step_id: "growth", kind: "code", title: "Calculating weekly growth", code: "tasks = [48, 91, 156]\ngrowth = [(b / a - 1) * 100 for a, b in zip(tasks, tasks[1:])]\nprint([round(value, 1) for value in growth])" },
    { type: "step_output", step_id: "growth", stream: "stdout", chunk: "[89.6, 71.4]\n" },
    { type: "step_done", step_id: "growth", status: "ok", output: "Completed tasks grew 89.6%, then 71.4%." },
    { type: "text_delta", message_id: "summary", delta: "Completed tasks grew " },
    { type: "message_done", message_id: "summary", text: "Completed tasks grew **89.6%** in week 2 and **71.4%** in week 3.\n\n| Week | Active teams | Completed tasks |\n| --- | ---: | ---: |\n| 1 | 12 | 48 |\n| 2 | 18 | 91 |\n| 3 | 24 | 156 |\n\nVolume is rising quickly. The percentage growth slowed, while the absolute increase rose from 43 to 65 tasks. Expand the activity above to inspect the tool inputs, results, and calculation." },
    { type: "turn_done", turn_id: "demo-turn", reason: "completed", usage },
    { type: "state", state: "idle" },
  ];
  return [...start,
    { type: "child_started", child_id: "research", name: "launch-research", model: "demo/research-agent", prompt: "Review the pilot milestones and summarize launch readiness." },
    { type: "child_step", child_id: "research", step_id: "review", title: "Reviewing the launch checklist", status: "running" },
    { type: "child_tool_call", child_id: "research", call_id: "docs", server: "documents", tool: "search", label: "Read 3 planning documents", status: "done" },
    { type: "child_step", child_id: "research", step_id: "review", title: "Reviewing the launch checklist", status: "ok" },
    { type: "child_done", child_id: "research", status: "completed", turns: 2, result: "The pilot is ready once invitations and the review deadline are confirmed.", usage },
    { type: "step_started", step_id: "brief", kind: "file", title: "Writing the launch brief" },
    { type: "step_done", step_id: "brief", status: "ok", output: "Created launch-brief.md and pilot-metrics.csv." },
    { type: "message_done", message_id: "summary", text: "The launch plan is ready for review. I prepared a brief with milestones and success criteria, plus the sample metrics. Open either file to preview and download it." },
    { type: "artifact", artifact_id: "brief", name: "launch-brief.md", title: "Pilot launch brief", path: "launch-brief.md", mime: "text/markdown", size: new TextEncoder().encode(BRIEF).length, version: 1 },
    { type: "artifact", artifact_id: "metrics", name: "pilot-metrics.csv", title: "Pilot metrics", path: "pilot-metrics.csv", mime: "text/csv", size: new TextEncoder().encode(CSV).length, version: 1 },
    { type: "turn_done", turn_id: "demo-turn", reason: "completed", usage },
    { type: "state", state: "idle" },
  ];
}
export function makeScenario(id: ScenarioId): Transcript { return append(EMPTY_TRANSCRIPT, ...scenarioEvents(id)); }
export function resolveDemoInteraction(t: Transcript, id: string, answer: InteractionAnswer): Transcript {
  if (!t.pending_interactions.includes(id)) throw new Error("This preview is already resolved. Reset the example to try again.");
  const response = answer.kind === "approve"
    ? answer.approved ? "**Demo email marked as sent.** The recipient, subject, and body were accepted. No real email was sent." : "**Email not sent.** The draft is still available in the approval card’s Details view."
    : `Kickoff preference recorded: **${answer.selected_ids?.map((id) => id === "monday" ? "Monday, 10:00 AM" : "Tuesday, 2:00 PM").join(", ") || answer.text || "No preference"}**. This is a local demo; no calendar event was created.`;
  return append(t,
    { type: "interaction_resolved", interaction_id: id, answer, by: "user" },
    ...(answer.kind === "approve" ? [{ type: "tool_call", call_id: "send-email", server: "mail", tool: "send_email", label: answer.approved ? "Sent the demo email" : "Skipped sending the email", args_preview: '{"to":"maya@example.com","subject":"Pilot launch — proposed schedule"}', status: answer.approved ? "done" : "declined", result_preview: answer.approved ? '{"simulated":true,"status":"sent"}' : '{"simulated":true,"status":"cancelled"}' } as EventBody] : []),
    { type: "message_done", message_id: `result-${id}`, text: response },
    { type: "turn_done", turn_id: "demo-turn", reason: "completed", usage },
    { type: "state", state: "idle" },
  );
}
