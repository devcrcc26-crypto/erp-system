/**
 * Compatibility shim: HR PDFs now use the payslip-style layout.
 * Prefer importing from `./payslip-style-pdf` in new code.
 */
export {
  PAYSLIP_COMPANY as COMPANY_NAME,
  PAYSLIP_FONT,
  dash,
  fmtDate,
  fmtEtb,
  fmtGeneratedDate as fmtTs,
  fullName,
  resolvePayslipFontPath as resolveFontPath,
  bilingualTitle,
  renderPayslipPdf,
  PayslipPdfPainter,
} from './payslip-style-pdf';

/** Legacy content-width constant (A4 portrait minus 40pt margins). */
export const M = 40;
export const CW = 595.28 - M * 2;
