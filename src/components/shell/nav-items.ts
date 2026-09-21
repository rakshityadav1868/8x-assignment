import {
  BarChart3,
  Building2,
  CalendarDays,
  Home,
  ListVideo,
  Mic,
  Radar,
  Search,
  Settings,
  Sparkles,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

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
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/record", label: "Record", icon: Mic },
      { href: "/upload", label: "Upload", icon: Upload },
      { href: "/playlists", label: "Playlists", icon: ListVideo },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/insights", label: "Insights", icon: BarChart3 },
      { href: "/trackers", label: "Trackers", icon: Radar },
      { href: "/deals", label: "Deals", icon: Building2 },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/team", label: "Team", icon: Users },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
