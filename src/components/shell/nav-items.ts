import { Home, ListVideo, Search, Settings, Sparkles, Upload, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      { href: "/calls", label: "Home", icon: Home },
      { href: "/search", label: "Search", icon: Search },
      { href: "/ask", label: "Ask Fanthom", icon: Sparkles },
      { href: "/upload", label: "Upload", icon: Upload },
      { href: "/playlists", label: "Playlists", icon: ListVideo },
    ],
  },
  {
    label: "Workspace",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];
