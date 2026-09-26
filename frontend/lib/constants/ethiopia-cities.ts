export const ETHIOPIA_CITIES = [
  'Addis Ababa',
  'Dire Dawa',
  'Bahir Dar',
  'Gondar',
  'Mekelle',
  'Hawassa',
  'Adama (Nazret)',
  'Jimma',
  'Dessie',
  'Jijiga',
  'Shashamane',
  'Bishoftu (Debre Zeit)',
  'Sodo (Wolaita)',
  'Arba Minch',
  'Harar',
  'Dilla',
  'Nekemte',
  'Asella',
  'Axum',
  'Lalibela',
] as const;

export type EthiopiaCity = (typeof ETHIOPIA_CITIES)[number] | 'Other';
