// Lets the profile menu jump to a specific section of the Settings page.
// The caller switches the view to "Settings" and records the target anchor id;
// the Settings page scrolls to it on mount and whenever the event fires.

export type SettingsSection = "scanning" | "privacy" | "about";

let pendingSection: SettingsSection | null = null;

export function requestSettingsSection(section: SettingsSection): void {
  pendingSection = section;
  window.dispatchEvent(new CustomEvent("vera-settings-section"));
}

export function consumeSettingsSection(): SettingsSection | null {
  const s = pendingSection;
  pendingSection = null;
  return s;
}
