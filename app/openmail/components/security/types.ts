/** UI risk tier (maps file/link verdict `blocked` → `dangerous`). */
export type SecurityRiskLevel =
  | "safe"
  | "suspicious"
  | "trusted_flagged"
  | "dangerous";
