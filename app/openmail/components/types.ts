export type ReplyTone = "Professional" | "Friendly" | "Direct" | "Short";

/** CORE predicted next step — highlights matching control in AIPanel. */
export type CoreRecommendedAction =
  | "reply"
  | "schedule"
  | "ignore"
  | "escalate"
  | "review";

export type ReplyState = {
  suggestions: string[];
  /** `-1` = no chip applied to the editor yet; `>= 0` = selected suggestion slot. */
  selectedIndex: number;
  currentReply: string;
};
