export const PER_DIEM_DESTINATION_CATEGORIES = [
  'Americas',
  'Asia',
  'Domestic',
  'East Africa',
  'Europe',
  'Middle East',
  'Other Africa',
] as const;

export type PerDiemDestinationCategory =
  (typeof PER_DIEM_DESTINATION_CATEGORIES)[number];

type RateField =
  | 'americasRate'
  | 'asiaRate'
  | 'domesticRate'
  | 'eastAfricaRate'
  | 'europeRate'
  | 'middleEastRate'
  | 'otherAfricaRate';

type ActiveField =
  | 'americasActive'
  | 'asiaActive'
  | 'domesticActive'
  | 'eastAfricaActive'
  | 'europeActive'
  | 'middleEastActive'
  | 'otherAfricaActive';

export const PER_DIEM_CATEGORY_FIELDS: Record<
  PerDiemDestinationCategory,
  { rate: RateField; active: ActiveField; labelKey: string }
> = {
  Americas: {
    rate: 'americasRate',
    active: 'americasActive',
    labelKey: 'hr.perDiemCategory.americas',
  },
  Asia: {
    rate: 'asiaRate',
    active: 'asiaActive',
    labelKey: 'hr.perDiemCategory.asia',
  },
  Domestic: {
    rate: 'domesticRate',
    active: 'domesticActive',
    labelKey: 'hr.perDiemCategory.domestic',
  },
  'East Africa': {
    rate: 'eastAfricaRate',
    active: 'eastAfricaActive',
    labelKey: 'hr.perDiemCategory.eastAfrica',
  },
  Europe: {
    rate: 'europeRate',
    active: 'europeActive',
    labelKey: 'hr.perDiemCategory.europe',
  },
  'Middle East': {
    rate: 'middleEastRate',
    active: 'middleEastActive',
    labelKey: 'hr.perDiemCategory.middleEast',
  },
  'Other Africa': {
    rate: 'otherAfricaRate',
    active: 'otherAfricaActive',
    labelKey: 'hr.perDiemCategory.otherAfrica',
  },
};
