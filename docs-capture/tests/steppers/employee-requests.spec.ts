import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import { captureStepper, fillVisibleTextInputs } from '../../src/helpers/stepper.js';
import { DOCS_ROLES, type DocsRoleKey } from '../../src/roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.join(__dirname, '../..', 'out');

function roleKeyFromProject(projectName: string): DocsRoleKey | null {
  const match = /^capture-(.+)$/.exec(projectName);
  if (!match) return null;
  return DOCS_ROLES.find((r) => r.slug === match[1])?.key ?? null;
}

/**
 * Multi-step request wizards most roles can open from /approvals/new/*.
 * Stops on the review step — does not submit.
 */
const WIZARDS: Array<{
  route: string;
  maxSteps: number;
  fill: (page: import('@playwright/test').Page, step: number) => Promise<void>;
}> = [
  {
    route: '/approvals/new/leave-request',
    maxSteps: 3,
    fill: async (page, step) => {
      if (step === 0) {
        await fillVisibleTextInputs(page, {
          reason: 'Docs capture sample leave request — do not submit',
        });
        // Leave type select if present
        const type = page.locator('.ant-select').first();
        if (await type.isVisible().catch(() => false)) {
          await type.click();
          await page.locator('.ant-select-item-option').first().click().catch(() => undefined);
        }
      }
    },
  },
  {
    route: '/approvals/new/expense-claim',
    maxSteps: 3,
    fill: async (page, step) => {
      if (step === 0) {
        await fillVisibleTextInputs(page, {
          title: 'Docs capture expense claim',
          description: 'Sample description for documentation screenshots',
        });
      }
    },
  },
  {
    route: '/approvals/new/per-diem',
    maxSteps: 3,
    fill: async (page, step) => {
      if (step === 0) {
        await fillVisibleTextInputs(page, {
          purpose: 'Docs capture per diem sample',
        });
      }
    },
  },
  {
    route: '/approvals/new/work-from-home',
    maxSteps: 2,
    fill: async (page, step) => {
      if (step === 0) {
        await fillVisibleTextInputs(page, {
          reason: 'Docs capture WFH sample — do not submit',
        });
      }
    },
  },
  {
    route: '/approvals/new/site-assignment',
    maxSteps: 2,
    fill: async (page, step) => {
      if (step === 0) {
        await fillVisibleTextInputs(page, {
          'site name': 'Docs Capture Site',
          reason: 'Documentation screenshot sample',
        });
      }
    },
  },
  {
    route: '/approvals/new/field-movement-log',
    maxSteps: 3,
    fill: async () => {
      // Month picker / day explanation are interactive; screenshot whatever is shown.
    },
  },
];

test.describe('request steppers', () => {
  for (const wizard of WIZARDS) {
    test(`stepper ${wizard.route}`, async ({ page }, testInfo) => {
      const roleKey = roleKeyFromProject(testInfo.project.name);
      if (!roleKey) {
        test.skip();
        return;
      }
      // Auth setup projects should not run steppers
      if (testInfo.project.name.startsWith('setup-')) {
        test.skip();
        return;
      }
      const role = DOCS_ROLES.find((r) => r.key === roleKey)!;
      await captureStepper({
        page,
        roleSlug: role.slug,
        roleLabel: role.label,
        route: wizard.route,
        outRoot: OUT_ROOT,
        maxSteps: wizard.maxSteps,
        fillStep: wizard.fill,
        stopAtReview: true,
      });
    });
  }
});
