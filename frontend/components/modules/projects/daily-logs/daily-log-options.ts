import type {
  WeatherCondition,
  RainfallLevel,
  VisitorPurpose,
  IncidentType,
  IncidentSeverity,
} from '@/lib/api/project-management.types';

export const SHIFT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'DAY', label: 'Day' },
  { value: 'NIGHT', label: 'Night' },
  { value: 'SPLIT', label: 'Split' },
];

export const WEATHER_OPTIONS: Array<{ value: WeatherCondition; label: string }> = [
  { value: 'SUNNY', label: 'Sunny' },
  { value: 'PARTLY_CLOUDY', label: 'Partly Cloudy' },
  { value: 'OVERCAST', label: 'Overcast' },
  { value: 'LIGHT_RAIN', label: 'Light Rain' },
  { value: 'HEAVY_RAIN', label: 'Heavy Rain' },
  { value: 'THUNDERSTORM', label: 'Thunderstorm' },
  { value: 'FOGGY', label: 'Foggy' },
  { value: 'WINDY', label: 'Windy' },
  { value: 'HOT_AND_DRY', label: 'Hot and Dry' },
];

export const RAINFALL_OPTIONS: Array<{ value: RainfallLevel; label: string }> = [
  { value: 'NONE', label: 'None' },
  { value: 'LIGHT', label: 'Light (1–5 mm)' },
  { value: 'MODERATE', label: 'Moderate (5–20 mm)' },
  { value: 'HEAVY', label: 'Heavy (>20 mm)' },
];

export const VISITOR_PURPOSE_OPTIONS: Array<{ value: VisitorPurpose; label: string }> = [
  { value: 'CLIENT_VISIT', label: 'Client Visit' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'CONSULTANT_VISIT', label: 'Consultant Visit' },
  { value: 'REGULATORY_AUTHORITY', label: 'Regulatory Authority' },
  { value: 'OTHER', label: 'Other' },
];

export const INCIDENT_TYPE_OPTIONS: Array<{ value: IncidentType; label: string }> = [
  { value: 'SAFETY_VIOLATION', label: 'Safety Violation' },
  { value: 'NEAR_MISS', label: 'Near Miss' },
  { value: 'FIRST_AID', label: 'First Aid' },
  { value: 'MEDICAL_TREATMENT', label: 'Medical Treatment' },
  { value: 'LOST_TIME_INJURY', label: 'Lost Time Injury' },
  { value: 'PROPERTY_DAMAGE', label: 'Property Damage' },
  { value: 'ENVIRONMENTAL', label: 'Environmental' },
  { value: 'OTHER', label: 'Other' },
];

export const INCIDENT_SEVERITY_OPTIONS: Array<{ value: IncidentSeverity; label: string }> = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'NEAR_MISS', label: 'Near Miss' },
];
