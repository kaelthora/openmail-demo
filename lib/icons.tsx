import type { HTMLAttributes } from "react";

export const ICONS = {
  inbox: "inbox",
  send: "send",
  draft: "draft",
  delete: "delete",
  reply: "reply",
  settings: "settings",
  contacts: "contacts",
  calendar: "calendar",
  sync: "sync",
} as const;

export type OpenMailIconName = keyof typeof ICONS;

type OpenMailIconProps = {
  name: OpenMailIconName;
  className?: string;
  size?: number;
  alt?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

function IconPaths({ name }: { name: OpenMailIconName }) {
  if (name === "inbox") {
    return (
      <>
        <path d="M3 12l2-6h14l2 6" />
        <path d="M3 12h5l2 3h4l2-3h5" />
      </>
    );
  }
  if (name === "send") return <path d="M3 11l18-8-8 18-2-7-8-3z" />;
  if (name === "draft") {
    return (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M8 16l8-8" />
      </>
    );
  }
  if (name === "delete") {
    return (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 14h10l1-14" />
      </>
    );
  }
  if (name === "reply") {
    return (
      <>
        <path d="M10 9l-5 5 5 5" />
        <path d="M5 14h9a5 5 0 0 1 5 5" />
      </>
    );
  }
  if (name === "settings") {
    return (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1-2-4-2 1a7 7 0 0 0-2-1l-.3-2h-4l-.3 2a7 7 0 0 0-2 1l-2-1-2 4 2 1a7 7 0 0 0 0 2l-2 1 2 4 2-1a7 7 0 0 0 2 1l.3 2h4l.3-2a7 7 0 0 0 2-1l2 1 2-4-2-1a7 7 0 0 0 .1-1z" />
      </>
    );
  }
  if (name === "contacts") {
    return (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
      </>
    );
  }
  if (name === "calendar") {
    return (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 3v4M16 3v4" />
      </>
    );
  }
  return (
    <>
      <path d="M4 12a8 8 0 0 1 14-5" />
      <path d="M20 12a8 8 0 0 1-14 5" />
    </>
  );
}

export function OpenMailIcon({
  name,
  className,
  size = 20,
  alt,
  ...rest
}: OpenMailIconProps) {
  void alt;
  return (
    <div
      className={["openmail-icon", "icon-container", className].filter(Boolean).join(" ")}
      aria-hidden="true"
      {...rest}
    >
      <svg
        className="icon"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="var(--icon-color)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <IconPaths name={name} />
      </svg>
    </div>
  );
}
