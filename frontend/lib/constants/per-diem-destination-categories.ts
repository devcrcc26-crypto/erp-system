export const PER_DIEM_DESTINATION_CATEGORIES = [
  'Domestic',
  'Regional',
  'International',
] as const;

export type PerDiemDestinationCategory =
  (typeof PER_DIEM_DESTINATION_CATEGORIES)[number];

type RateField = 'domesticRate' | 'regionalRate' | 'internationalRate';

type ActiveField =
  | 'domesticActive'
  | 'regionalActive'
  | 'internationalActive';

export const PER_DIEM_CATEGORY_FIELDS: Record<
  PerDiemDestinationCategory,
  {
    rate: RateField;
    active: ActiveField;
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
