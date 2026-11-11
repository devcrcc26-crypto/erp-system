import * as fs from 'fs';
import * as path from 'path';

/** Minimal valid PDF bytes for demo storage. */
function minimalPdfBuffer(title: string): Buffer {
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length ${title.length + 50}>>stream
BT /F1 12 Tf 72 720 Td (${title.replace(/[()\\]/g, '_')}) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
${300 + title.length}
%%EOF`;
  return Buffer.from(body, 'utf-8');
}

export interface SeedPdfEntry {
  fileKey: string;
  absolutePath: string;
  fileSizeBytes: number;
}

const PROJECT_CODES = ['ZMC-2023-002', 'LJZ-2024-001', 'PDR-2025-003'] as const;

/** Engineering seed PDFs referenced by the demo seed prompt. */
const ENGINEERING_SEED_FILES = [
  'structural-foundation-calc.pdf',
  'hvac-schematic-basement.pdf',
  'architectural-ground-floor.pdf',
  'structural-drawings-rev-a.pdf',
  'mep-coordination-drawing.pdf',
  'concrete-mix-design.pdf',
  'rebar-mill-certificate.pdf',
] as const;

const COMMON_FILES = [
  'Contract-Agreement.pdf',
  'Site-Safety-Plan.pdf',
  'Project-Execution-Plan.pdf',
  'Contract-Agreement-v2.pdf',
  'Foundation-Layout-Rev-A.pdf',
  'Foundation-Layout-Rev-B.pdf',
  'Foundation-Layout-Rev-C.pdf',
  'Structural-Steel-Rev-A.pdf',
  'HVAC-Layout-Rev-A.pdf',
  'Electrical-SLD-Rev-A.pdf',
  'MEP-Coordination-Rev-A.pdf',
  'Architecture-Facade-Rev-A.pdf',
  'Architecture-Facade-Rev-B-Draft.pdf',
  'Site-Grading-Rev-A.pdf',
  'Civil-Grading-Locked.pdf',
  'Review-Markup-Package.pdf',
  'Session-Attachment-Notes.pdf',
  'Package-Brief-Supplement.pdf',
  'Drawing-A-101-revC.pdf',
  'Drawing-S-201-revB.pdf',
  'Pile-cap-checklist-signed.pdf',
  'O-and-M-Manual-Sample.pdf',
  'As-Built-Structural.pdf',
  'Closeout-Handover-Pack.pdf',
] as const;

/** Attachment-specific PDFs for submittals, review markups, and package/session files. */
export const ATTACHMENT_FILES = [
  'Reviewer-Markup-Grid-B4.pdf',
  'Designer-Response-Memo.pdf',
  'Site-Installation-Photo-Report.pdf',
  'Construction-Checklist-Signed.pdf',
  'External-Release-Site-Transmittal.pdf',
  'External-Release-Consultant-Cover.pdf',
  'Package-Brief-Coordination-Supplement.pdf',
  'Session-Tier1-Owner-Markup.pdf',
  'Session-Tier2-Reviewer-Redlines.pdf',
  'Session-Tier3-Lead-Approval.pdf',
  'Drawing-Markup-MEP-Level12.pdf',
  'RFI-Sketch-Embed-Detail.pdf',
  'Comment-Resolution-Photo-Evidence.pdf',
  'Submittal-Site-As-Built-Photos.pdf',
] as const;

/**
 * Ensures a single attachment PDF exists and returns its metadata.
 */
export function ensureProjectAttachmentPdf(
  projectCode: string,
  fileName: string,
  registry: Map<string, SeedPdfEntry>,
): SeedPdfEntry {
  const fileKey = `demo/${projectCode}/attachments/${fileName}`;
  const existing = registry.get(fileKey);
  if (existing) {
    return existing;
  }

  const projectDir = path.join(__dirname, 'generated', projectCode, 'attachments');
  fs.mkdirSync(projectDir, { recursive: true });
  const absolutePath = path.join(projectDir, fileName);
  const title = `${projectCode} - ${fileName}`;
  const buffer = minimalPdfBuffer(title);
  fs.writeFileSync(absolutePath, buffer);
  const entry: SeedPdfEntry = { fileKey, absolutePath, fileSizeBytes: buffer.length };
  registry.set(fileKey, entry);
  return entry;
}

/**
 * Writes real PDF files under prisma/seed-files/generated and returns metadata keyed by storage fileKey.
 */
export function createSeedPdfFiles(): Map<string, SeedPdfEntry> {
  const rootDir = path.join(__dirname, 'generated');
  const registry = new Map<string, SeedPdfEntry>();

  fs.mkdirSync(rootDir, { recursive: true });

  const engineeringDir = path.join(__dirname);
  for (const fileName of ENGINEERING_SEED_FILES) {
    const absolutePath = path.join(engineeringDir, fileName);
    const fileKey = `demo/engineering/${fileName}`;
    const title = `Engineering seed - ${fileName}`;
    const buffer = minimalPdfBuffer(title);
    fs.writeFileSync(absolutePath, buffer);
    registry.set(fileKey, {
      fileKey,
      absolutePath,
      fileSizeBytes: buffer.length,
    });
  }

  for (const projectCode of PROJECT_CODES) {
    const projectDir = path.join(rootDir, projectCode);
    fs.mkdirSync(projectDir, { recursive: true });

    for (const fileName of COMMON_FILES) {
      const fileKey = `demo/${projectCode}/${fileName}`;
      const absolutePath = path.join(projectDir, fileName);
      const title = `${projectCode} - ${fileName}`;
      const buffer = minimalPdfBuffer(title);
      fs.writeFileSync(absolutePath, buffer);
      registry.set(fileKey, {
        fileKey,
        absolutePath,
        fileSizeBytes: buffer.length,
      });
    }

    const attachmentDir = path.join(projectDir, 'attachments');
    fs.mkdirSync(attachmentDir, { recursive: true });
    for (const fileName of ATTACHMENT_FILES) {
      ensureProjectAttachmentPdf(projectCode, fileName, registry);
    }
  }

  return registry;
}
