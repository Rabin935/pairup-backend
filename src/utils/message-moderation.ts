const BANNED_WORDS = [
  "hate",
  "abuse",
  "threat",
  "violence",
];

export type MessageModerationResult = {
  flagged: boolean;
  matchedWords: string[];
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const moderateMessageText = (text: string): MessageModerationResult => {
  const normalizedText = text.trim().toLowerCase();

  if (!normalizedText) {
    return {
      flagged: false,
      matchedWords: [],
    };
  }

  const matchedWords = BANNED_WORDS.filter((word) => {
    const pattern = new RegExp(`\\b${escapeRegex(word.toLowerCase())}\\b`, "i");
    return pattern.test(normalizedText);
  });

  return {
    flagged: matchedWords.length > 0,
    matchedWords,
  };
};

export const buildModerationReportReason = (matchedWords: string[]): string => {
  if (matchedWords.length === 0) {
    return "Auto-flagged message due to policy violation";
  }

  return `Auto-flagged message due to banned words: ${matchedWords.join(", ")}`;
};
