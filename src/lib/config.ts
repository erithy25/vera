export interface NavItem {
  label: string;
  icon: string;
  active: boolean;
}

export const navItems: NavItem[] = [
  { label: "Scan", icon: "ScanLine", active: true },
  { label: "Detectors", icon: "KeyRound", active: false },
  { label: "Settings", icon: "Settings", active: false },
];
