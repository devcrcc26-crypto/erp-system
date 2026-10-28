import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  filterGuideByRole,
  parseGuideRoleTag,
} from '@/lib/help/filter-guide-by-role';

describe('parseGuideRoleTag', () => {
  it('splits and normalizes role groups', () => {
    expect(parseGuideRoleTag('HR, SUPERVISOR')).toEqual(['HR', 'SUPERVISOR']);
    expect(parseGuideRoleTag(' employee ')).toEqual(['EMPLOYEE']);
  });

  it('ignores unknown tokens', () => {
    expect(parseGuideRoleTag('HR, ADMIN, SUPERVISOR')).toEqual([
      'HR',
      'SUPERVISOR',
    ]);
  });
});

describe('filterGuideByRole', () => {
  const sample = `## For everyone

Shared steps.

<!-- role: HR -->
## HR only

Import attendance.
<!-- /role -->

<!-- role: HR, SUPERVISOR -->
## Approve requests

Approve or return.
<!-- /role -->

<!-- role: EMPLOYEE -->
## Your payslip

Open My Profile.
<!-- /role -->
`;

  it('keeps matching blocks and strips markers', () => {
    const hr = filterGuideByRole(sample, 'HR');
    expect(hr).toContain('## For everyone');
    expect(hr).toContain('## HR only');
    expect(hr).toContain('## Approve requests');
    expect(hr).not.toContain('## Your payslip');
    expect(hr).not.toMatch(/<!--\s*role:/i);
    expect(hr).not.toMatch(/<!--\s*\/role/i);

    const supervisor = filterGuideByRole(sample, 'SUPERVISOR');
    expect(supervisor).not.toContain('## HR only');
    expect(supervisor).toContain('## Approve requests');
    expect(supervisor).not.toContain('## Your payslip');

    const employee = filterGuideByRole(sample, 'EMPLOYEE');
    expect(employee).not.toContain('## HR only');
    expect(employee).not.toContain('## Approve requests');
    expect(employee).toContain('## Your payslip');
  });

  it('keeps a block when the tag list is empty after filtering unknowns', () => {
    const markdown = `<!-- role: UNKNOWN -->
## Kept
<!-- /role -->`;
    expect(filterGuideByRole(markdown, 'EMPLOYEE')).toContain('## Kept');
  });
});

describe('guide role tags', () => {
  const guideRoot = path.join(process.cwd(), 'public', 'guide');
  const slugs = fs
    .readdirSync(path.join(guideRoot, 'en'))
    .filter((file) => file.endsWith('.md'));

  function roleTags(lang: string, file: string): string[] {
    const markdown = fs.readFileSync(path.join(guideRoot, lang, file), 'utf-8');
    return [...markdown.matchAll(/<!--\s*(\/?)role:?\s*([^>]*?)\s*-->/gi)].map(
      ([, close, roles]) => (close ? '/role' : (roles ?? '').replace(/\s+/g, '')),
    );
  }

  it.each(slugs)('%s has balanced, known tags matching between en and zh', (file) => {
    const en = roleTags('en', file);
    let open = false;
    for (const tag of en) {
      if (tag === '/role') {
        expect(open).toBe(true);
        open = false;
      } else {
        expect(open).toBe(false);
        expect(parseGuideRoleTag(tag)).toHaveLength(tag.split(',').length);
        open = true;
      }
    }
    expect(open).toBe(false);
    expect(roleTags('zh', file)).toEqual(en);
  });
});
