# HR import/export components

Shared building blocks used by every HR list and detail page:

- `ExportExcelButton` — Excel export of the currently filtered list rows.
- `ExportPdfButton` — PDF export of a single record.
- `ImportModal` — the full import flow: template download, client-side
  validation, preview table, commit with per-row feedback.

They pair with `lib/utils/hr-export-excel.ts` (workbook builder),
`lib/utils/hr-document-pdf.ts` (PDF layout builder),
`lib/utils/hr-import-schema.ts` (client-side parser) and
`lib/utils/hr-import-configs.ts` (per-module column schemas).

The full guide to adding import/export to a new module — including the backend
half — lives at
[`backend/src/modules/hr-shared/application/import-export/IMPORT_EXPORT.md`](../../../../../backend/src/modules/hr-shared/application/import-export/IMPORT_EXPORT.md).
