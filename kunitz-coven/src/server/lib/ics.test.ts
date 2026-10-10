import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { expandIcs } from "./ics.js";

const body = fs.readFileSync(path.join(import.meta.dirname, "__fixtures__/google.ics"), "utf8");

describe("expandIcs", () => {
  const events = expandIcs(body, "2026-10-01", "2027-05-01");
  const byTitle = (t: string) => events.filter((e) => e.title.startsWith(t));

  it("expands weekly events across the DST change keeping the local wall-clock time", () => {
    const soccer = byTitle("Soccer practice").filter((e) => e.title === "Soccer practice");
    expect(soccer[0].start).toBe("2026-10-20T16:00");
    expect(soccer[0].end).toBe("2026-10-20T17:30");
    // After DST ends (Nov 1) it is still 4pm local.
    expect(soccer.find((e) => e.start.startsWith("2026-11-03"))?.start).toBe("2026-11-03T16:00");
  });

  it("honours EXDATE, moved and cancelled occurrences", () => {
    const starts = byTitle("Soccer practice").map((e) => e.start);
    expect(starts).not.toContain("2026-10-27T16:00");
    expect(starts).not.toContain("2026-11-10T16:00");
    expect(starts).toContain("2026-11-10T17:00");
    expect(starts.some((s) => s.startsWith("2026-11-17"))).toBe(false);
    expect(byTitle("Soccer practice (moved)")[0].end).toBe("2026-11-10T18:30");
  });

  it("keeps all-day multi-day events as date ranges", () => {
    const trip = byTitle("Grandma visit")[0];
    expect(trip).toMatchObject({ allDay: true, start: "2026-11-23", end: "2026-11-26" });
  });

  it("converts UTC times to the household timezone", () => {
    expect(byTitle("Dentist")[0]).toMatchObject({ start: "2026-10-15T09:00", end: "2026-10-15T10:00", notes: "Bring insurance card" });
  });

  it("expands yearly all-day events", () => {
    expect(byTitle("Emma's birthday").map((e) => e.start)).toEqual(["2027-04-12"]);
  });
});

describe("expandIcs across time zones", () => {
  const london = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:DAYLIGHT
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
DTSTART:19700329T010000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
DTSTART:19701025T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Europe/London:20261013T090000
DTEND;TZID=Europe/London:20261013T100000
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;TZID=Europe/London:20261110T090000
UID:standup@example.com
SUMMARY:London standup
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/London:20261117T110000
DTEND;TZID=Europe/London:20261117T120000
RECURRENCE-ID;TZID=Europe/London:20261117T090000
UID:standup@example.com
SUMMARY:London standup (moved)
END:VEVENT
END:VCALENDAR`;

  it("keeps a London 9am meeting at 9am London time through both DST changes (shown in New York time)", () => {
    const ev = expandIcs(london, "2026-10-12", "2026-11-25");
    const starts = ev.map((e) => `${e.title}@${e.start}`);
    expect(starts).toEqual([
      "London standup@2026-10-13T04:00", // BST & EDT: 08:00Z
      "London standup@2026-10-20T04:00",
      "London standup@2026-10-27T05:00", // UK back on GMT, US still EDT: 09:00Z
      "London standup@2026-11-03T04:00", // both on standard time
      // 11-10 excluded by EXDATE
      "London standup (moved)@2026-11-17T06:00",
      "London standup@2026-11-24T04:00",
    ]);
  });
});

describe("expandIcs limits", () => {
  it("ignores minutely rules and caps how many occurrences one event expands to", () => {
    const feed = (rule: string) =>
      ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:x", "DTSTART:20261001T120000Z", "DTEND:20261001T121500Z", "SUMMARY:Spam", rule, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    expect(expandIcs(feed("RRULE:FREQ=MINUTELY"), "2026-10-01", "2027-10-01")).toHaveLength(0);
    expect(expandIcs(feed("RRULE:FREQ=HOURLY"), "2026-10-01", "2027-10-01").length).toBeLessThanOrEqual(5000);
  });
});
