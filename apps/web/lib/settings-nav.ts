// The settings pages, listed in the main sidebar under Settings (and in the mobile page picker).
export const SETTINGS_PAGES: { route: string; label: string; group: 'Workspace' | 'Data' }[] = [
  { route: 'general', label: 'General', group: 'Workspace' },
  { route: 'phone-numbers', label: 'Phone numbers', group: 'Workspace' },
  { route: 'calling', label: 'Calling & recording', group: 'Workspace' },
  { route: 'billing', label: 'Plan & billing', group: 'Workspace' },
  { route: 'integrations', label: 'Integrations', group: 'Data' },
];
export const settingsHref = (route: string) => `/app/settings/${route}`;
