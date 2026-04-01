export const THEMES = [
  {
    id: "aether",
    label: "AETHER",
    icon: "/icons/aether.png",
    class: "theme-aether",
  },
  {
    id: "nova",
    label: "NOVA",
    icon: "/icons/nova.png",
    class: "theme-nova",
  },
  {
    id: "orbital",
    label: "ORBITAL",
    icon: "/icons/orbital.png",
    class: "theme-orbital",
  },
  {
    id: "ember",
    label: "EMBER",
    icon: "/icons/ember.png",
    class: "theme-ember",
  },
  {
    id: "carbonite",
    label: "CARBONITE",
    icon: "/icons/carbonite.png",
    class: "theme-carbonite",
  },
  {
    id: "blacken",
    label: "BLACKEN",
    icon: "/icons/blacken.jpg",
    class: "theme-blacken",
  },
  {
    id: "voidbeast",
    label: "VOIDBEAST",
    icon: "/icons/voidbeast.jpg",
    class: "theme-voidbeast",
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

/** When a theme asset is missing, swap once (e.g. BLACKEN → carbonite tile). */
export const THEME_ICON_FALLBACK: Partial<Record<ThemeId, string>> = {
  blacken: "/icons/carbonite.png",
  voidbeast: "/icons/blacken.jpg",
};
