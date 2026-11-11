import type { RoleGroup } from '@/lib/help/modules';

const ROLE_BLOCK =
  /<!--\s*role:\s*([^>]+?)\s*-->\s*([\s\S]*?)\s*<!--\s*\/role\s*-->/gi;

const VALID_GROUPS = new Set<RoleGroup>(['HR', 'SUPERVISOR', 'EMPLOYEE']);

/**
 * Parses `<!-- role: HR, SUPERVISOR -->` tags into role groups.
 * Unknown tokens are ignored.
 */
export function parseGuideRoleTag(raw: string): RoleGroup[] {
  return raw
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter((part): part is RoleGroup =>
      VALID_GROUPS.has(part as RoleGroup),
    );
}

/**
 * Removes guide sections wrapped in `<!-- role: … -->…<!-- /role -->` when
 * the viewer’s help role group is not listed. Kept blocks are returned
 * without the HTML comment markers.
 */
export function filterGuideByRole(
  markdown: string,
  roleGroup: RoleGroup,
): string {
  return markdown.replace(ROLE_BLOCK, (_match, rawRoles: string, body: string) => {
    const allowed = parseGuideRoleTag(rawRoles);
    if (allowed.length === 0 || allowed.includes(roleGroup)) {
      return body.replace(/^\n+/, '').replace(/\n+$/, '\n\n');
    }
    return '';
  });
}
