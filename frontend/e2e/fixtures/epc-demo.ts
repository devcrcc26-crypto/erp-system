/**
 * Deterministic EPC demo IDs - must match backend/prisma/seed-epc-demo.ts.
 */
function sid(project: number, entity: number): string {
  const n = project * 1000 + entity;
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export const EPC_DEMO = {
  projectId: sid(1, 1),
  taskDisciplineId: sid(1, 200),
  designPackageId: sid(1, 210),
  designPackageLeadId: sid(1, 212),
  designPackageName: 'Foundation Drawings - Review Package',
  designPackageLeadName: 'Structural Calculations - Lead Review',
  reviewCommentSnippet: 'Clarify pile cap reinforcement',
} as const;

export const E2E_USERS = {
  reviewer: {
    email: process.env.E2E_REVIEWER_EMAIL ?? 'reviewer@company.local',
    password: process.env.E2E_PASSWORD ?? 'Admin@12345',
  },
  lead: {
    email: process.env.E2E_LEAD_EMAIL ?? 'lead@company.local',
    password: process.env.E2E_PASSWORD ?? 'Admin@12345',
  },
  designer: {
    email: process.env.E2E_DESIGNER_EMAIL ?? 'engineer@company.local',
    password: process.env.E2E_PASSWORD ?? 'Admin@12345',
  },
} as const;
