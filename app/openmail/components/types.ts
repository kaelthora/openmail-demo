export type ReplyTone = "Professional" | "Friendly" | "Direct" | "Short";

export type ReplyState = {
  suggestions: string[];
  selectedIndex: number;
  currentReply: string;
};
