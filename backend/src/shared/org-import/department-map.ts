/** Sheet "Dept." codes → ERP department display names. */
export const SHEET_DEPT_TO_ERP_NAME: Readonly<Record<string, string>> = {
  'Dsg.Dpt.1': 'Municipal Transport Department',
  'Dsg.Dpt.2': 'Architectural Design Department',
  'Admin.Dpt.': 'Administration',
};

export function mapSheetDepartment(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return SHEET_DEPT_TO_ERP_NAME[trimmed] ?? trimmed;
}
