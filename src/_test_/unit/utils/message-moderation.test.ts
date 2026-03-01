import {
  buildModerationReportReason,
  moderateMessageText,
} from "../../../utils/message-moderation";

describe("message moderation utils", () => {
  it("returns not flagged for empty string", () => {
    const result = moderateMessageText("");
    expect(result).toEqual({ flagged: false, matchedWords: [] });
  });

  it("returns not flagged for whitespace only", () => {
    const result = moderateMessageText("    ");
    expect(result.flagged).toBe(false);
    expect(result.matchedWords).toEqual([]);
  });

  it("flags a banned word", () => {
    const result = moderateMessageText("This contains violence");
    expect(result.flagged).toBe(true);
    expect(result.matchedWords).toContain("violence");
  });

  it("matches case-insensitively", () => {
    const result = moderateMessageText("I THREAT you");
    expect(result.flagged).toBe(true);
    expect(result.matchedWords).toEqual(["threat"]);
  });

  it("matches only whole words", () => {
    const result = moderateMessageText("I hater this");
    expect(result.flagged).toBe(false);
    expect(result.matchedWords).toEqual([]);
  });

  it("detects multiple banned words", () => {
    const result = moderateMessageText("hate and abuse and threat");
    expect(result.flagged).toBe(true);
    expect(result.matchedWords).toEqual(["hate", "abuse", "threat"]);
  });

  it("builds default report reason for empty list", () => {
    const reason = buildModerationReportReason([]);
    expect(reason).toBe("Auto-flagged message due to policy violation");
  });

  it("builds report reason with matched words", () => {
    const reason = buildModerationReportReason(["abuse", "violence"]);
    expect(reason).toContain("abuse, violence");
  });
});
