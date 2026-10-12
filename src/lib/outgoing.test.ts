import { reduceAll } from "../model";
import { describe, expect, it } from "vitest";

import { events } from "../test/fixtures";

import { inThread, isQueued, lastUserMessage, unabsorbed, type Outgoing } from "./outgoing";

const out = (over: Partial<Outgoing>): Outgoing => ({ cid: "c", text: "hi", attachments: [], status: "sent", baseUserCount: 0, ...over });

describe("unabsorbed", () => {
  const t = reduceAll(events({ type: "user_message", message_id: "m1", text: "hi", attachments: [] }));

  it("drops a message once its user_message (same id) is in the transcript", () => {
    expect(unabsorbed([out({ message_id: "m1" })], t)).toEqual([]);
  });

  it("keeps a queued message whose id the transcript has not seen", () => {
    const q = out({ message_id: "m2", status: "queued", text: "later" });
    expect(unabsorbed([q], t)).toEqual([q]);
  });

  it("before the POST returns (no id), matches by text after the send point", () => {
    expect(unabsorbed([out({ baseUserCount: 0 })], t)).toEqual([]);
    const sentAfter = out({ baseUserCount: 1 });
    expect(unabsorbed([sentAfter], t)).toEqual([sentAfter]);
  });

  it("two identical texts claim two different user turns", () => {
    const t2 = reduceAll(events({ type: "user_message", message_id: "m1", text: "again", attachments: [] }));
    const a = out({ cid: "a", text: "again" });
    const b = out({ cid: "b", text: "again" });
    expect(unabsorbed([a, b], t2)).toEqual([b]);
  });

  it("predicates split thread vs queue", () => {
    expect(inThread(out({ status: "sending" }))).toBe(true);
    expect(inThread(out({ status: "failed" }))).toBe(true);
    expect(inThread(out({ status: "queued" }))).toBe(false);
    expect(isQueued(out({ status: "queued" }))).toBe(true);
  });

  it("lastUserMessage is the most recent user turn", () => {
    const t3 = reduceAll(
      events(
        { type: "user_message", message_id: "m1", text: "one", attachments: [] },
        { type: "user_message", message_id: "m2", text: "two", attachments: [{ id: "f", name: "a.txt", mime: "text/plain", size: 1 }] },
      ),
    );
    expect(lastUserMessage(t3)).toMatchObject({ text: "two", attachments: [{ id: "f" }] });
  });
});
