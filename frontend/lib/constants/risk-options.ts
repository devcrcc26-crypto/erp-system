import type { RiskCategory } from '@/lib/api/project-management.types';

export const RISK_CATEGORY_OPTIONS: { value: RiskCategory; label: string }[] = [
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'ENVIRONMENTAL', label: 'Environmental' },
  { value: 'FINANCIAL', label: 'Financial' },
  { value: 'COST', label: 'Cost' },
  { value: 'SCHEDULE', label: 'Schedule' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'CONTRACTUAL', label: 'Contractual' },
  { value: 'POLITICAL', label: 'Political' },
  { value: 'OTHER', label: 'Other' },
];
