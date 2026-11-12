/**
 * Opt HR list pages into Approvals list chrome.
 * Run from frontend/: node scripts/migrate-hr-lists-approvals-chrome.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const hrRoot = path.join('components', 'modules', 'hr');
const importLine =
  "import '@/components/modules/approvals/approvals-v2.css';\n";

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('ListPageContent.tsx')) out.push(p);
  }
  return out;
}

function moveStatsOutsideHero(s) {
  const re =
    /(<section\s+className="erp-employees-hero"[\s\S]*?<div className="erp-employees-hero-top">[\s\S]*?<\/div>\s*\n\s*)(<div className="erp-users-stat-bar erp-employees-hero-stats">[\s\S]*?<\/div>\s*\n\s*<\/section>)/;
  return s.replace(re, (_m, topBlock, statBlock) => {
    const hero = topBlock
      .replaceAll('erp-employees-hero', 'erp-approvals-hero')
      .replaceAll('erp-employees-hero-top', 'erp-approvals-hero-top')
      .replaceAll('erp-employees-hero-title', 'erp-approvals-hero-title');
    const stats = statBlock
      .replace(' erp-employees-hero-stats', '')
      .replace(/\s*<\/section>\s*$/, '');
    return `${hero}</section>\n\n      ${stats.trim()}\n`;
  });
}

function migrate(file) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('erp-employees-hero') && !s.includes('erp-employees-list-card')) {
    return false;
  }

  if (!s.includes("import '@/components/modules/approvals/approvals-v2.css'")) {
    const idx = s.indexOf("'use client'");
    if (idx === -1) return false;
    const after = s.indexOf('\n', idx) + 1;
    s = s.slice(0, after) + importLine + s.slice(after);
  }

  if (!s.includes('erp-approvals-page')) {
    s = s.replace(
      /(const\s+(?:PAGE_ROOT|PAGE_CHROME)\s*=\s*\n?\s*['"])([^'"]+)(['"])/,
      (_m, pre, classes, post) => {
        if (classes.includes('erp-approvals-page')) return _m;
        const next = classes.includes('erp-approvals-v2')
          ? classes.replace(
              'erp-pro-list-page',
              'erp-pro-list-page erp-approvals-page',
            )
          : classes.replace(
              'erp-pro-list-page erp-users-page',
              'erp-pro-list-page erp-users-page erp-approvals-page erp-approvals-v2',
            );
        return `${pre}${next}${post}`;
      },
    );
    s = s.replace(
      /className="(erp-pro-list-page erp-users-page[^"]+)"/g,
      (m, classes) => {
        if (classes.includes('erp-approvals-page')) return m;
        return `className="${classes} erp-approvals-page erp-approvals-v2"`;
      },
    );
  }

  if (s.includes('erp-employees-hero-stats')) {
    s = moveStatsOutsideHero(s);
  }

  fs.writeFileSync(file, s);
  return true;
}

const files = walk(hrRoot);
let n = 0;
for (const f of files) {
  if (migrate(f)) {
    n += 1;
    console.log('updated', f);
  }
}
console.log(`done: ${n} files`);
