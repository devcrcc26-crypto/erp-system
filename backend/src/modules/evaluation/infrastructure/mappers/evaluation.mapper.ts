type DecimalLike = { toNumber: () => number } | number | null | undefined;

/**
 * Converts Prisma Decimal (or number) values to JSON-safe numbers.
 */
export function decimalToNumber(value: DecimalLike): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'object' && 'toNumber' in value) {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface EvaluationTemplateWithSections {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  sections: Array<{
    id: string;
    name: string;
    nameZh: string | null;
    description: string | null;
    weight: DecimalLike;
    sortOrder: number;
    criteria: Array<{
      id: string;
      name: string;
      nameZh: string | null;
      description: string | null;
      weight: DecimalLike;
      isActive: boolean;
      sortOrder: number;
    }>;
  }>;
}

/**
 * Maps an evaluation template (with nested sections/criteria) for API responses.
 */
export function mapEvaluationTemplate(
  template: EvaluationTemplateWithSections,
): Record<string, unknown> {
  return {
    id: template.id,
    companyId: template.companyId,
    name: template.name,
    description: template.description,
    version: template.version,
    isActive: template.isActive,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    sections: template.sections.map((section) => ({
      id: section.id,
      name: section.name,
      nameZh: section.nameZh,
      description: section.description,
      weight: decimalToNumber(section.weight),
      sortOrder: section.sortOrder,
      criteria: section.criteria.map((criterion) => ({
        id: criterion.id,
        name: criterion.name,
        nameZh: criterion.nameZh,
        description: criterion.description,
        weight: decimalToNumber(criterion.weight),
        isActive: criterion.isActive,
        sortOrder: criterion.sortOrder,
      })),
    })),
  };
}

interface EvaluationListRow {
  finalScore: DecimalLike;
  adjustedScore: DecimalLike;
  assessments?: Array<{
    overallAvg: DecimalLike;
    scores: unknown[];
    [key: string]: unknown;
  }>;
  disputes?: Array<{
    dlAdjustedScore: DecimalLike;
    hrFinalScore: DecimalLike;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Maps an employee evaluation row for API responses (decimals → numbers).
 */
export function mapEmployeeEvaluation(
  evaluation: EvaluationListRow,
): Record<string, unknown> {
  return {
    ...evaluation,
    finalScore: decimalToNumber(evaluation.finalScore),
    adjustedScore: decimalToNumber(evaluation.adjustedScore),
    assessments: evaluation.assessments?.map((assessment) => ({
      ...assessment,
      overallAvg: decimalToNumber(assessment.overallAvg),
      scores: assessment.scores,
    })),
    disputes: evaluation.disputes?.map((dispute) => ({
      ...dispute,
      dlAdjustedScore: decimalToNumber(dispute.dlAdjustedScore),
      hrFinalScore: decimalToNumber(dispute.hrFinalScore),
    })),
  };
}
