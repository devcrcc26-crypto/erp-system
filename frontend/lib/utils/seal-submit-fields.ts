interface SealSubmitFields {
  sealCategory?: string;
  copyCount?: number;
}

/** Appends optional seal fields to multipart submit payloads. */
export function appendSealSubmitFields(
  formData: FormData,
  fields: SealSubmitFields,
): void {
  if (fields.sealCategory) {
    formData.append('sealCategory', fields.sealCategory);
  }
  if (fields.copyCount != null) {
    formData.append('copyCount', String(fields.copyCount));
  }
}

/** Builds JSON body fields for seal submit requests. */
export function sealSubmitJsonFields(fields: SealSubmitFields): SealSubmitFields {
  return {
    ...(fields.sealCategory ? { sealCategory: fields.sealCategory } : {}),
    ...(fields.copyCount != null ? { copyCount: fields.copyCount } : {}),
  };
}
