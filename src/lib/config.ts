export interface NavItem {
  label: string;
  icon: string;
  active: boolean;
}

export const navItems: NavItem[] = [
  { label: "Today", icon: "Clock", active: true },
  { label: "Settings", icon: "Settings", active: false },
];
