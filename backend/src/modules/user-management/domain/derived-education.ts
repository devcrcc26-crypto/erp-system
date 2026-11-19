import { EducationLevel } from '@prisma/client';

/**
 * Certificate types from EducationRecord.certificateType, ranked highest first.
 * MA/BA map to the closest EducationLevel enum values (MSC / BSC).
 */
const CERTIFICATE_RANK: ReadonlyArray<{
  keys: readonly string[];
  rank: number;
  level: EducationLevel;
}> = [
  { keys: ['phd'], rank: 6, level: EducationLevel.PHD },
  { keys: ['msc'], rank: 5, level: EducationLevel.MSC },
  { keys: ['ma'], rank: 4, level: EducationLevel.MSC },
  { keys: ['bsc'], rank: 3, level: EducationLevel.BSC },
  { keys: ['ba'], rank: 2, level: EducationLevel.BSC },
  { keys: ['diploma'], rank: 1, level: EducationLevel.DIPLOMA },
];

function normalizeCertificate(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function resolveCertificate(
  value: string | null | undefined,
): { rank: number; level: EducationLevel } | null {
  const key = normalizeCertificate(value);
  if (!key) {
    return null;
  }
  for (const entry of CERTIFICATE_RANK) {
    if (entry.keys.includes(key)) {
      return { rank: entry.rank, level: entry.level };
    }
  }
  return null;
}

/**
 * Highest EducationLevel across certificate types (PhD > MSc > MA > BSc > BA > Diploma).
 */
export function deriveEducationLevel(
  certificateTypes: ReadonlyArray<string | null | undefined>,
): EducationLevel | null {
  let best: { rank: number; level: EducationLevel } | null = null;
  for (const certificateType of certificateTypes) {
    const resolved = resolveCertificate(certificateType);
    if (!resolved) {
      continue;
    }
    if (!best || resolved.rank > best.rank) {
      best = resolved;
    }
  }
  return best?.level ?? null;
}

type EducationStudyRow = {
  subjectMajor?: string | null;
  graduationYear?: number | null;
  createdAt?: Date | null;
};

/**
 * Field of study from the most recent EducationRecord (graduation year, then createdAt).
 */
export function deriveFieldOfStudy(
  records: ReadonlyArray<EducationStudyRow>,
): string | null {
  if (records.length === 0) {
    return null;
  }
  const sorted = [...records].sort((a, b) => {
    const yearA = a.graduationYear ?? Number.NEGATIVE_INFINITY;
    const yearB = b.graduationYear ?? Number.NEGATIVE_INFINITY;
    if (yearA !== yearB) {
      return yearB - yearA;
    }
    const createdA = a.createdAt?.getTime() ?? 0;
    const createdB = b.createdAt?.getTime() ?? 0;
    return createdB - createdA;
  });
  for (const row of sorted) {
    const major = row.subjectMajor?.trim();
    if (major) {
      return major;
    }
  }
  return null;
}
