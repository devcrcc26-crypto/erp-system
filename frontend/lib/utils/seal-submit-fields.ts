import {
  appendOnBehalfFields,
  type OnBehalfPayload,
} from '@/lib/api/on-behalf.types';

interface SealSubmitFields extends OnBehalfPayload {
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
  appendOnBehalfFields(formData, fields);
}

/** Builds JSON body fields for seal submit requests. */
export function sealSubmitJsonFields(fields: SealSubmitFields): SealSubmitFields {
  return {
    ...(fields.sealCategory ? { sealCategory: fields.sealCategory } : {}),
    ...(fields.copyCount != null ? { copyCount: fields.copyCount } : {}),
    ...(fields.onBehalfOfEmployeeId
      ? {
          onBehalfOfEmployeeId: fields.onBehalfOfEmployeeId,
          autoApproveTier: fields.autoApproveTier === true,
        }
      : {}),
  };
}
