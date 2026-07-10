import type { jsPDF } from 'jspdf';

/** Registered jsPDF font family that includes Simplified Chinese glyphs. */
export const PDF_CJK_FONT = 'NotoSansSC';

const FONT_FILE_NAME = 'NotoSansSC-Regular.ttf';

/** Prefer a local copy when present; otherwise load from Google Fonts CDN. */
const FONT_SOURCES = [
  '/fonts/NotoSansSC-Regular.ttf',
  'https://fonts.gstatic.com/s/notosanssc/v37/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYxNbPzS5HE.ttf',
] as const;

let cachedFontBase64: string | null = null;
let fontLoadPromise: Promise<string> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchFontBase64(): Promise<string> {
  if (cachedFontBase64) {
    return cachedFontBase64;
  }

  let lastError: unknown;
  for (const url of FONT_SOURCES) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 10_000) {
        throw new Error(`Font payload too small from ${url}`);
      }
      cachedFontBase64 = arrayBufferToBase64(buffer);
      return cachedFontBase64;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to load CJK font for PDF export');
}

/**
 * Registers a Simplified Chinese–capable font on the jsPDF document.
 * Returns the font family name to use with setFont / autoTable styles.
 */
export async function ensurePdfCjkFont(doc: jsPDF): Promise<string> {
  if (!fontLoadPromise) {
    fontLoadPromise = fetchFontBase64().catch((error: unknown) => {
      fontLoadPromise = null;
      throw error;
    });
  }

  const base64 = await fontLoadPromise;
  doc.addFileToVFS(FONT_FILE_NAME, base64);
  doc.addFont(FONT_FILE_NAME, PDF_CJK_FONT, 'normal');
  doc.addFont(FONT_FILE_NAME, PDF_CJK_FONT, 'bold');
  doc.setFont(PDF_CJK_FONT, 'normal');
  return PDF_CJK_FONT;
}
