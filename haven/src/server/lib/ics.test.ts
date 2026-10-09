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
