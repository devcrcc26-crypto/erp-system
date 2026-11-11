import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_ROLES } from '../src/roles.js';
import { readAllManifests, type ManifestRecord } from '../src/helpers/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const DESCRIPTIONS_PATH = path.join(ROOT, 'descriptions.json');

function loadDescriptions(): Record<string, string> {
  if (!fs.existsSync(DESCRIPTIONS_PATH)) return {};
  return JSON.parse(fs.readFileSync(DESCRIPTIONS_PATH, 'utf8')) as Record<
    string,
    string
  >;
}

function moduleOf(route: string): string {
  const clean = route.split('#')[0] ?? route;
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return 'home';
  if (parts[0] === 'hr') return parts[1] ? `hr/${parts[1]}` : 'hr';
  if (parts[0] === 'approvals') return 'approvals';
  if (parts[0] === 'help') return 'help';
  if (parts[0] === 'organization') return 'organization';
  return parts[0];
}

function descriptionFor(
  record: ManifestRecord,
  descriptions: Record<string, string>,
): string {
  const key =
    record.descriptionKey ??
    (record.modalName ? `${record.route}#${record.modalName}` : record.route);
  return (
    descriptions[key] ??
    `<!-- TODO: add description for \`${key}\` in docs-capture/descriptions.json -->`
  );
}

function buildGuide(roleSlug: string, roleLabel: string): string {
  const descriptions = loadDescriptions();
  const records = readAllManifests(roleSlug, OUT).filter(
    (r) =>
      r.kind === 'page' ||
      r.kind === 'modal' ||
      r.kind === 'stepper-step' ||
      r.kind === 'no-access',
  );

  const pages = records.filter((r) => r.kind === 'page' || r.kind === 'no-access');
  const byModule = new Map<string, ManifestRecord[]>();
  for (const page of pages) {
    const mod = moduleOf(page.route);
    const list = byModule.get(mod) ?? [];
    list.push(page);
    byModule.set(mod, list);
  }

  const modules = [...byModule.keys()].sort();
  const lines: string[] = [
    `# ${roleLabel} — Navigation Guide`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Table of contents',
    '',
  ];

  for (const mod of modules) {
    lines.push(`- [${mod}](#${mod.replace(/[^\w/-]+/g, '').replace(/\//g, '-')})`);
  }
  lines.push('');

  for (const mod of modules) {
    lines.push(`## ${mod}`);
    lines.push('');
    const modulePages = byModule.get(mod) ?? [];
    for (const page of modulePages) {
      lines.push(`### ${page.title ?? page.route}`);
      lines.push('');
      lines.push(`- **URL:** \`${page.url ?? page.route}\``);
      lines.push(`- **Route:** \`${page.route}\``);
      if (page.kind === 'no-access') {
        lines.push(`- **Access:** no-access — ${page.reason ?? ''}`);
      }
      lines.push('');
      lines.push(descriptionFor(page, descriptions));
      lines.push('');
      if (page.image && page.kind === 'page') {
        lines.push(`![${page.title ?? page.route}](${page.image})`);
        lines.push('');
      }

      const modals = records.filter(
        (r) => r.kind === 'modal' && r.route === page.route,
      );
      for (const modal of modals) {
        lines.push(`#### Modal: ${modal.modalName ?? modal.title}`);
        lines.push('');
        lines.push(descriptionFor(modal, descriptions));
        lines.push('');
        if (modal.image) {
          lines.push(`![${modal.modalName}](${modal.image})`);
          lines.push('');
        }
      }

      const steps = records
        .filter((r) => r.kind === 'stepper-step' && r.route.startsWith(page.route))
        .sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));
      for (const step of steps) {
        lines.push(
          `#### Step ${(step.stepIndex ?? 0) + 1}: ${step.stepTitle ?? step.title}`,
        );
        lines.push('');
        lines.push(descriptionFor(step, descriptions));
        lines.push('');
        if (step.image) {
          lines.push(`![${step.stepTitle}](${step.image})`);
          lines.push('');
        }
      }
    }
  }

  // Orphan steppers (e.g. profile#field-movement)
  const orphanSteps = records.filter(
    (r) =>
      r.kind === 'stepper-step' &&
      !pages.some((p) => r.route.startsWith(p.route.split('#')[0])),
  );
  if (orphanSteps.length > 0) {
    lines.push('## steppers');
    lines.push('');
    for (const step of orphanSteps.sort(
      (a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0),
    )) {
      lines.push(`### ${step.route} — ${step.stepTitle ?? step.title}`);
      lines.push('');
      lines.push(descriptionFor(step, descriptions));
      lines.push('');
      if (step.image) {
        lines.push(`![${step.stepTitle}](${step.image})`);
        lines.push('');
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function main(): void {
  for (const role of DOCS_ROLES) {
    const roleOut = path.join(OUT, role.slug);
    if (!fs.existsSync(path.join(roleOut, 'manifest'))) {
      continue;
    }
    const md = buildGuide(role.slug, role.label);
    const outPath = path.join(roleOut, 'guide.md');
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(`Wrote ${outPath}`);
  }
}

main();
