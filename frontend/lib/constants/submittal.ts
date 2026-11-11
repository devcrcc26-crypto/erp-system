/**
 * Standard construction submittal category labels (frontend-only; category is free text in DB).
 */
export const SUBMITTAL_CATEGORIES = [
  'Shop drawings',
  'Product data / cut sheets',
  'Material samples',
  'Engineering calculations',
  'Mockups',
  'Vendor information',
  'Warranties and manuals',
  'As-built drawings',
  'Other',
] as const;

export type SubmittalCategoryOption = (typeof SUBMITTAL_CATEGORIES)[number];
