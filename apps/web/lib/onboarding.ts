export const STEPS = [
  { n: 1, slug: 'workspace', label: 'Workspace', skippable: false },
  { n: 2, slug: 'business', label: 'About your business', skippable: false },
  { n: 3, slug: 'icp', label: 'Ideal customer', skippable: true },
  { n: 4, slug: 'number', label: 'Get your number', skippable: true },
  { n: 5, slug: 'test', label: 'Test your setup', skippable: true },
  { n: 6, slug: 'compliance', label: 'Compliance', skippable: false },
  { n: 7, slug: 'invite', label: 'Invite your team', skippable: true },
] as const;

export type StepSlug = (typeof STEPS)[number]['slug'];
export const stepBySlug = (slug: string) => STEPS.find((s) => s.slug === slug);
export const stepByNumber = (n: number) => STEPS.find((s) => s.n === n) ?? STEPS[0];
