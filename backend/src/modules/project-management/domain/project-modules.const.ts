export const ALL_PM_MODULES = [
  'schedule',
  'rfis',
  'submittals',
  'daily_logs',
  'meetings',
  'correspondence',
  'risks',
  'issues',
  'punch_items',
  'closeout',
  'change_requests',
  'deliverables',
  'engineering_documents',
  'design_packages',
  'review_sessions',
] as const;

export type PmModuleKey = (typeof ALL_PM_MODULES)[number];

/**
 * When visibleModules is empty on a ProjectTeam row, the member can see ALL modules.
 * This preserves backwards compatibility.
 */
export function canAccessModule(
  visibleModules: string[],
  module: PmModuleKey,
): boolean {
  if (visibleModules.length === 0) {
    return true;
  }
  return visibleModules.includes(module);
}
