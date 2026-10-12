import type { Event, EventBody } from "../model";
export function events(...bodies: EventBody[]): Event[] {
  return bodies.map((body, i) => ({ ...body, seq: i + 1, ts: new Date(i * 1000).toISOString() }));
}
