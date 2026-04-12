/** Sidebar + nav folder keys (views). Trash/archive are flag-based, not `MailItem.folder`. */
export type OpenmailSidebarFolderId =
  | "inbox"
  | "drafts"
  | "sent"
  | "spam"
  | "trash"
  | "archive";
