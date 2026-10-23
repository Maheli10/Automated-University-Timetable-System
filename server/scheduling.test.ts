import { describe, expect, it } from "vitest";
import { intervalsOverlap, minutes, suggestTimes } from "./routers";
import {
  defaultConstraintPolicy,
  validateTimeConstraints,
} from "./constraints";

describe("scheduling interval rules", () => {
  it("converts teaching times to comparable minutes", () => {
    expect(minutes("08:30")).toBe(510);
    expect(minutes("16:30")).toBe(990);
  });
  it("detects partial overlaps, not only matching starts", () => {
    expect(intervalsOverlap("09:00", "11:00", "10:30", "12:00")).toBe(true);
    expect(intervalsOverlap("10:30", "12:00", "09:00", "11:00")).toBe(true);
  });
  it("suggests alternate teaching windows when the current window is occupied", () => {
    const active = [
      {
        session: {
          startTime: "08:30",
          endTime: "10:20",
          batch: "Y3-S1",
          roomId: 1,
        },
      },
    ];
    expect(
      suggestTimes({ day: "Monday", batch: "Y3-S1", roomId: 1 }, active)
    ).toContain("Monday 10:40–12:30");
  });
  it("allows back-to-back sessions", () => {
    expect(intervalsOverlap("08:30", "10:20", "10:20", "12:30")).toBe(false);
  });
  it("protects official breaks and lunch", () => {
    expect(
      validateTimeConstraints(
        {
          day: "Monday",
          startTime: "12:00",
          endTime: "13:00",
          classType: "Theory",
        },
        defaultConstraintPolicy
      ).join(" ")
    ).toContain("Lunch break");
  });
  it("requires practical sessions to use a complete practical slot", () => {
    expect(
      validateTimeConstraints(
        {
          day: "Monday",
          startTime: "09:30",
          endTime: "11:30",
          classType: "Practical",
        },
        defaultConstraintPolicy
      ).join(" ")
    ).toContain("complete university practical slot");
  });
  it("blocks configured university events", () => {
    const policy = {
      ...defaultConstraintPolicy,
      blockedPeriods: [
        {
          day: "Monday",
          start: "14:00",
          end: "15:00",
          label: "Faculty meeting",
        },
      ],
    };
    expect(
      validateTimeConstraints(
        {
          day: "Monday",
          startTime: "14:00",
          endTime: "15:00",
          classType: "Theory",
        },
        policy
      ).join(" ")
    ).toContain("Faculty meeting");
  });
  it("keeps Wednesday afternoon free", () => {
    for (const [startTime, endTime, classType] of [
      ["12:30", "13:25", "Theory"],
      ["13:30", "15:20", "Practical"],
      ["15:40", "16:35", "Theory"],
    ] as const) {
      expect(
        validateTimeConstraints(
          { day: "Wednesday", startTime, endTime, classType },
          defaultConstraintPolicy
        ).join(" ")
      ).toContain("Wednesday afternoon protected period");
    }
  });
});
