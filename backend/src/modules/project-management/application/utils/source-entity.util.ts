import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

export const SOURCE_ENTITY_TYPES = [
  'MEETING',
  'CORRESPONDENCE',
  'DAILY_LOG',
  'SUBMITTAL_REVIEW',
] as const;

export type SourceEntityType = (typeof SOURCE_ENTITY_TYPES)[number];

export interface SourceEntitySummary {
  type: string;
  id: string;
  label: string;
}

/**
 * Validates that a source entity exists within the given project.
 */
export async function validateSourceEntity(
  prisma: PrismaService,
  projectId: string,
  type: string,
  id: string,
): Promise<void> {
  let exists = false;

  if (type === 'MEETING') {
    const record = await prisma.meeting.findFirst({
      where: activeOnly({ id, projectId }),
    });
    exists = !!record;
  }

  if (type === 'CORRESPONDENCE') {
    const record = await prisma.correspondence.findFirst({
      where: activeOnly({ id, projectId }),
    });
    exists = !!record;
  }

  if (type === 'DAILY_LOG') {
    const record = await prisma.dailyLog.findFirst({
      where: activeOnly({ id, projectId }),
    });
    exists = !!record;
  }

  if (type === 'SUBMITTAL_REVIEW') {
    const record = await prisma.submittalReview.findFirst({
      where: { id },
      include: { submittal: { select: { projectId: true, deletedAt: true } } },
    });
    exists =
      !!record &&
      record.submittal.projectId === projectId &&
      record.submittal.deletedAt === null;
  }

  if (!exists) {
    throw new NotFoundException(
      `Source ${type} with id ${id} not found in this project.`,
    );
  }
}

/**
 * Resolves a human-readable label for a source entity link.
 */
export async function resolveSourceEntityLabel(
  prisma: PrismaService,
  projectId: string,
  type: string,
  id: string,
): Promise<string> {
  if (type === 'MEETING') {
    const record = await prisma.meeting.findFirst({
      where: activeOnly({ id, projectId }),
      select: { title: true },
    });
    return record?.title ?? id;
  }

  if (type === 'CORRESPONDENCE') {
    const record = await prisma.correspondence.findFirst({
      where: activeOnly({ id, projectId }),
      select: { subject: true },
    });
    return record?.subject ?? id;
  }

  if (type === 'DAILY_LOG') {
    const record = await prisma.dailyLog.findFirst({
      where: activeOnly({ id, projectId }),
      select: { logDate: true },
    });
    if (!record) {
      return id;
    }
    const date = record.logDate.toISOString().slice(0, 10);
    return `Daily Log - ${date}`;
  }

  if (type === 'SUBMITTAL_REVIEW') {
    const record = await prisma.submittalReview.findFirst({
      where: { id },
      include: { submittal: { select: { submittalNumber: true, projectId: true } } },
    });
    if (!record || record.submittal.projectId !== projectId) {
      return id;
    }
    return `Submittal Review - ${record.submittal.submittalNumber}`;
  }

  if (type === 'RFI') {
    const record = await prisma.rfi.findFirst({
      where: activeOnly({ id, projectId }),
      select: { rfiNumber: true, title: true },
    });
    if (!record) {
      return id;
    }
    return `RFI ${record.rfiNumber} - ${record.title}`;
  }

  if (type === 'ISSUE') {
    const record = await prisma.issue.findFirst({
      where: activeOnly({ id, projectId }),
      select: { issueNumber: true, issueType: true },
    });
    if (!record) {
      return id;
    }
    return `Issue ${record.issueNumber} - ${record.issueType}`;
  }

  if (type === 'CHANGE_REQUEST') {
    const record = await prisma.projectChangeRequest.findFirst({
      where: activeOnly({ id, projectId }),
      select: { changeNumber: true, title: true },
    });
    if (!record) {
      return id;
    }
    return `CR ${record.changeNumber} - ${record.title}`;
  }

  return id;
}

/**
 * Builds a source entity summary for API responses.
 */
export async function buildSourceEntitySummary(
  prisma: PrismaService,
  projectId: string,
  type: string | null | undefined,
  id: string | null | undefined,
): Promise<SourceEntitySummary | null> {
  if (!type || !id) {
    return null;
  }

  const label = await resolveSourceEntityLabel(prisma, projectId, type, id);
  return { type, id, label };
}

export interface RaisedRfiSummary {
  id: string;
  rfiNumber: string;
  subject: string;
  status: string;
  priority: string;
}

export interface RaisedIssueSummary {
  id: string;
  issueNumber: string;
  title: string;
  status: string;
  severity: string;
}

export interface RaisedChangeRequestSummary {
  id: string;
  changeNumber: string;
  title: string;
  status: string;
}

/**
 * Loads RFIs, issues, and change requests raised from a meeting or correspondence.
 */
export async function loadRaisedItemsForSource(
  prisma: PrismaService,
  projectId: string,
  sourceType: 'MEETING' | 'CORRESPONDENCE',
  sourceId: string,
): Promise<{
  raisedRfis: RaisedRfiSummary[];
  raisedIssues: RaisedIssueSummary[];
  raisedChangeRequests: RaisedChangeRequestSummary[];
}> {
  const rfiWhere = {
    sourceEntityType: sourceType,
    sourceEntityId: sourceId,
    projectId,
    deletedAt: null,
  };

  const crWhere = {
    originEntityType: sourceType,
    originEntityId: sourceId,
    projectId,
    deletedAt: null,
  };

  const [linkedRfis, linkedIssues, linkedChangeRequests] = await Promise.all([
    prisma.rfi.findMany({
      where: rfiWhere,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        rfiNumber: true,
      },
    }),
    prisma.issue.findMany({
      where: rfiWhere,
      select: {
        id: true,
        issueType: true,
        status: true,
        severity: true,
        issueNumber: true,
      },
    }),
    prisma.projectChangeRequest.findMany({
      where: crWhere,
      select: {
        id: true,
        title: true,
        status: true,
        changeNumber: true,
      },
    }),
  ]);

  return {
    raisedRfis: linkedRfis.map((row) => ({
      id: row.id,
      rfiNumber: row.rfiNumber,
      subject: row.title,
      status: row.status,
      priority: row.priority,
    })),
    raisedIssues: linkedIssues.map((row) => ({
      id: row.id,
      issueNumber: row.issueNumber,
      title: row.issueType,
      status: row.status,
      severity: row.severity,
    })),
    raisedChangeRequests: linkedChangeRequests.map((row) => ({
      id: row.id,
      changeNumber: row.changeNumber,
      title: row.title,
      status: row.status,
    })),
  };
}
