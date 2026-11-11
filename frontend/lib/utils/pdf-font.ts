import type { jsPDF } from 'jspdf';

/**
 * Browser jsPDF only embeds TrueType (.ttf). Backend payslips use the same
 * Noto Sans SC family via PDFKit + `backend/assets/fonts/NotoSansSC-Regular.otf`.
 * Keep `frontend/public/fonts/NotoSansSC-Regular.ttf` in sync when updating fonts.
 */
const FONT_VFS_NAME = 'NotoSansSC-Regular.ttf';
const FONT_URL = '/fonts/NotoSansSC-Regular.ttf';

/** jsPDF font family name for embedded Noto Sans SC. */
export const PDF_FONT = 'NotoSansSC';

let cachedBase64: string | null = null;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function loadFontBase64(): Promise<string> {
  if (cachedBase64) {
    return cachedBase64;
  }
  const response = await fetch(FONT_URL);
  if (!response.ok) {
    throw new Error(`Failed to load CJK font (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  cachedBase64 = uint8ToBase64(new Uint8Array(buffer));
  return cachedBase64;
}

/**
 * Registers NotoSansSC with a jsPDF instance so CJK characters render correctly.
 * Call once immediately after `new jsPDF(...)`, before any text calls.
 */
export async function registerCjkFont(doc: jsPDF): Promise<void> {
  const base64 = await loadFontBase64();
  doc.addFileToVFS(FONT_VFS_NAME, base64);
  doc.addFont(FONT_VFS_NAME, PDF_FONT, 'normal');
  doc.addFont(FONT_VFS_NAME, PDF_FONT, 'bold');
  doc.setFont(PDF_FONT, 'normal');
}
