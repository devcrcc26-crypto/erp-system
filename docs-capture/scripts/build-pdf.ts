import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdToPdf } from 'md-to-pdf';
import { DOCS_ROLES } from '../src/roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'out');

async function main(): Promise<void> {
  for (const role of DOCS_ROLES) {
    const guidePath = path.join(OUT, role.slug, 'guide.md');
    if (!fs.existsSync(guidePath)) {
      continue;
    }
    const pdfPath = path.join(OUT, role.slug, 'guide.pdf');
    const result = await mdToPdf(
      { path: guidePath },
      {
        dest: pdfPath,
        pdf_options: {
          format: 'A4',
          printBackground: true,
          margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
        },
        basedir: path.join(OUT, role.slug),
      },
    );
    if (!result) {
      throw new Error(`md-to-pdf failed for ${guidePath}`);
    }
    console.log(`Wrote ${pdfPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
