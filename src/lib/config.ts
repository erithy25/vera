export interface NavItem {
  label: string;
  icon: string;
  active: boolean;
}

export const navItems: NavItem[] = [
  { label: "Today", icon: "Clock", active: true },
  { label: "Clients & Projects", icon: "Briefcase", active: false },
  { label: "Settings", icon: "Settings", active: false },
];
