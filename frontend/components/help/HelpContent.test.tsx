import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HelpContent from '@/components/help/HelpContent';

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

vi.mock('@/hooks/use-auth-capabilities', () => ({
  useCanViewHr: () => false,
}));

vi.mock('@/lib/query/profile', () => ({
  useCurrentUser: () => ({
    data: { roles: [{ name: 'Employee' }] },
  }),
}));

const SAMPLE = `Intro paragraph for the topic.

**Who does what**

| Role | What you can do |
| --- | --- |
| Employee | Submit requests. |

*(HR only)*

---

## First section

1. Open the form.
2. Fill in the details:
   - **Date**
   - **Amount**
3. Click **Submit**.

> **What happens next:** It goes to approval.

## Second section

> **Note:** Unpaid leave has no balance.

## Third section

> **Rules:**
> - Only drafts can be edited.
`;

describe('HelpContent', () => {
  it('lays guide markdown out as ERP cards', () => {
    const { container } = render(
      <HelpContent content={SAMPLE} title="Leave Requests" iconKey="guide-leave" />,
    );

    // Header card: title and the opening paragraph.
    const header = screen.getByRole('heading', { level: 1, name: 'Leave Requests' }).closest('header');
    expect(header).toBeTruthy();
    expect(within(header as HTMLElement).getByText('Intro paragraph for the topic.')).toBeTruthy();

    // Overview card: the label is the card title, the table its body.
    const overview = screen.getByText('Who does what').closest('section');
    expect(overview?.className).toContain('erp-employee-section');
    expect(within(overview as HTMLElement).getByRole('table')).toBeTruthy();
    expect(screen.getByText('HR only').closest('span')?.className).toContain('rounded-full');

    // One card per section; `---` separators are dropped.
    const first = screen.getByRole('heading', { level: 2, name: 'First section' }).closest('section');
    expect(first?.id).toBeTruthy();
    expect(container.querySelector('hr')).toBeNull();

    const index = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(index).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'First section',
      'Second section',
      'Third section',
    ]);

    const steps = (first as HTMLElement).querySelector('ol');
    expect(steps?.children).toHaveLength(3);
    expect(within(steps as HTMLElement).getByText('Amount')).toBeTruthy();

    expect(screen.getByText('What happens next:').closest('div.border-l-4')?.className).toContain('border-[#1D9E75]');
    expect(screen.getByText('Note:').closest('div.border-l-4')?.className).toContain('border-[#378ADD]');
    expect(screen.getByText('Only drafts can be edited.').closest('div.border-l-4')).toBeTruthy();
  });

  it.each(['en', 'zh'])('renders every %s guide without raw markdown markers', (lang) => {
    const dir = path.join(process.cwd(), 'public', 'guide', lang);
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.md'))) {
      const { container, unmount } = render(
        <HelpContent
          content={readFileSync(path.join(dir, file), 'utf8')}
          roleGroup="HR"
        />,
      );
      const text = container.textContent ?? '';
      expect(text, file).not.toMatch(/(^|\s)> /);
      expect(text, file).not.toContain('**');
      expect(text, file).not.toMatch(/\|\s*---/);
      expect(text, file).not.toMatch(/<!--\s*role:/i);
      unmount();
    }
  });

  it('hides role-tagged sections that do not match the viewer', () => {
    const markdown = `Shared intro.

## For everyone

Anyone can read this.

<!-- role: HR -->
## HR import

Only HR sees this.
<!-- /role -->

<!-- role: HR, SUPERVISOR -->
## Approve a request

Approvers see this.
<!-- /role -->
`;

    const { unmount } = render(
      <HelpContent content={markdown} title="Leave" roleGroup="EMPLOYEE" />,
    );
    expect(screen.getByRole('heading', { name: 'For everyone' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'HR import' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Approve a request' })).toBeNull();
    unmount();

    render(
      <HelpContent content={markdown} title="Leave" roleGroup="SUPERVISOR" />,
    );
    expect(screen.queryByRole('heading', { name: 'HR import' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Approve a request' })).toBeTruthy();
  });
});
