import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { toAuditJsonSnapshot } from '../utils/audit-value.util';

type SnapshotFetcher = (
  prisma: PrismaService,
  companyId: string,
  recordId: string,
) => Promise<unknown>;

const ACTIVE = { deletedAt: null } as const;

const PROJECT_SCOPE = (companyId: string): Prisma.ProjectWhereInput => ({
  companyId,
  deletedAt: null,
});

/**
 * Loads entity state before CUD operations for audit before/after diffs.
 */
@Injectable()
export class AuditSnapshotService {
  private readonly fetchers: Readonly<Record<string, SnapshotFetcher>>;

  constructor(private readonly prisma: PrismaService) {
    this.fetchers = {
      branches: (prisma, companyId, recordId) =>
        prisma.branch.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      divisions: (prisma, companyId, recordId) =>
        prisma.division.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      departments: (prisma, companyId, recordId) =>
        prisma.department.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      cost_centres: (prisma, companyId, recordId) =>
        prisma.costCentre.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      positions: (prisma, companyId, recordId) =>
        prisma.position.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      users: (prisma, companyId, recordId) =>
        prisma.user.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      roles: (prisma, companyId, recordId) =>
        prisma.role.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      projects: (prisma, companyId, recordId) =>
        prisma.project.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      documents: (prisma, companyId, recordId) =>
        prisma.document.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      document_folders: (prisma, companyId, recordId) =>
        prisma.documentFolder.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      financial_years: (prisma, companyId, recordId) =>
        prisma.financialYear.findFirst({
          where: { id: recordId, companyId },
        }),
      financial_periods: (prisma, companyId, recordId) =>
        prisma.financialPeriod.findFirst({
          where: { id: recordId, companyId },
        }),
      company_settings: (prisma, companyId, recordId) =>
        prisma.companySetting.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      report_definitions: (prisma, companyId, recordId) =>
        prisma.reportDefinition.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      widgets: (prisma, companyId, recordId) =>
        prisma.dashboardWidget.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      daily_logs: (prisma, companyId, recordId) =>
        prisma.dailyLog.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      rfis: (prisma, companyId, recordId) =>
        prisma.rfi.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      submittals: (prisma, companyId, recordId) =>
        prisma.submittal.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      tasks: (prisma, companyId, recordId) =>
        prisma.task.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      milestones: (prisma, companyId, recordId) =>
        prisma.milestone.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      drawings: (prisma, companyId, recordId) =>
        prisma.drawing.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      meetings: (prisma, companyId, recordId) =>
        prisma.meeting.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      correspondence: (prisma, companyId, recordId) =>
        prisma.correspondence.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      risks: (prisma, companyId, recordId) =>
        prisma.risk.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      issues: (prisma, companyId, recordId) =>
        prisma.issue.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      punch_items: (prisma, companyId, recordId) =>
        prisma.punchItem.findFirst({
          where: {
            id: recordId,
            ...ACTIVE,
            project: PROJECT_SCOPE(companyId),
          },
        }),
      engineering_documents: (prisma, companyId, recordId) =>
        prisma.engineeringDocument.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      design_packages: (prisma, companyId, recordId) =>
        prisma.designPackage.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      deliverables: (prisma, companyId, recordId) =>
        prisma.deliverable.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      items: (prisma, companyId, recordId) =>
        prisma.designPackageItem.findFirst({
          where: { id: recordId, companyId },
        }),
      dependencies: (prisma, companyId, recordId) =>
        prisma.designPackageDependency.findFirst({
          where: { id: recordId, companyId },
        }),
      disciplines: (prisma, companyId, recordId) =>
        prisma.taskDiscipline.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
      versions: (prisma, companyId, recordId) =>
        prisma.engineeringDocumentVersion.findFirst({
          where: { id: recordId, companyId, ...ACTIVE },
        }),
    };
  }

  /**
   * Captures the current persisted state for an entity before it is mutated.
   */
  async capture(
    companyId: string,
    recordType: string,
    recordId: string,
  ): Promise<Prisma.InputJsonValue | undefined> {
    if (recordId === 'unknown') {
      return undefined;
    }

    const fetcher = this.fetchers[recordType];
    if (!fetcher) {
      return undefined;
    }

    const record = await fetcher(this.prisma, companyId, recordId);
    return toAuditJsonSnapshot(record);
  }
}
