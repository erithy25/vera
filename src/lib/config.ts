export interface NavItem {
  label: string;
  icon: string;
  active: boolean;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", icon: "Home", active: true },
  { label: "Timeline", icon: "Clock", active: false },
  { label: "Agents", icon: "Users", active: false },
  { label: "Knowledge", icon: "BookOpen", active: false },
  { label: "Goals", icon: "Target", active: false },
  { label: "Settings", icon: "Settings", active: false },
];

export const userProfile = {
  name: "Taylor Morgan",
  plan: "Pro Plan",
  initials: "TM",
};

export interface AgentInfo {
  name: string;
  role: string;
  description: string;
  avatarText: string;
}

export const agents: AgentInfo[] = [
  {
    name: "Planner",
    role: "Planner",
    description: "Helps plan your day and stay on track",
    avatarText: "PL",
  },
  {
    name: "Writer",
    role: "Writer",
    description: "Drafts, edits, and refines your writing",
    avatarText: "WR",
  },
  {
    name: "Researcher",
    role: "Researcher",
    description: "Finds answers and summarizes anything",
    avatarText: "RE",
  },
  {
    name: "Coach",
    role: "Coach",
    description: "Keeps you focused and builds better habits",
    avatarText: "CO",
  },
];
