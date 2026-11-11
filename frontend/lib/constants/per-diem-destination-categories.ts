export const PER_DIEM_DESTINATION_CATEGORIES = [
  'Domestic',
  'Regional',
  'International',
] as const;

export type PerDiemDestinationCategory =
  (typeof PER_DIEM_DESTINATION_CATEGORIES)[number];

export type PerDiemRateField = 'domesticRate' | 'regionalRate' | 'internationalRate';

export type PerDiemActiveField =
  | 'domesticActive'
  | 'regionalActive'
  | 'internationalActive';

export const PER_DIEM_CATEGORY_FIELDS: Record<
  PerDiemDestinationCategory,
  {
    rate: PerDiemRateField;
    active: PerDiemActiveField;
    labelKey: string;
    descriptionKey: string;
  }
> = {
  Domestic: {
    rate: 'domesticRate',
    active: 'domesticActive',
    labelKey: 'hr.perDiemCategory.domestic',
    descriptionKey: 'hr.perDiemCategory.domesticDescription',
  },
  Regional: {
    rate: 'regionalRate',
    active: 'regionalActive',
    labelKey: 'hr.perDiemCategory.regional',
    descriptionKey: 'hr.perDiemCategory.regionalDescription',
  },
  International: {
    rate: 'internationalRate',
    active: 'internationalActive',
    labelKey: 'hr.perDiemCategory.international',
    descriptionKey: 'hr.perDiemCategory.internationalDescription',
  },
};
