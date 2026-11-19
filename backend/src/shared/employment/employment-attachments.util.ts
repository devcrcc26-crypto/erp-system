import { BadRequestException } from '@nestjs/common';
import { FolderContextType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { activeOnly } from '../prisma/soft-delete.util';
import { DocumentService } from '../../modules/documents/application/services/document.service';

export type UploadedEmploymentFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type EmploymentAttachmentDto = {
  id: string;
  name: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: string;
};

const MAX_FILES = 10;

export function assertEmploymentFileCount(files: UploadedEmploymentFile[]): void {
  if (files.length > MAX_FILES) {
    throw new BadRequestException(`At most ${MAX_FILES} files can be attached`);
  }
}

/** Lists current documents in an attachment folder (empty when none). */
export async function listEmploymentAttachments(
  prisma: PrismaService,
  companyId: string,
  folderId: string | null | undefined,
): Promise<EmploymentAttachmentDto[]> {
  if (!folderId) {
    return [];
  }
  const documents = await prisma.document.findMany({
    where: activeOnly({ companyId, folderId, isCurrent: true }),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      fileType: true,
      fileSizeBytes: true,
      createdAt: true,
    },
  });
  return documents.map((doc) => ({
    id: doc.id,
    name: doc.name,
    fileType: doc.fileType,
    fileSizeBytes: doc.fileSizeBytes,
    createdAt: doc.createdAt.toISOString(),
  }));
}

/**
 * Creates an attachment folder (if needed), uploads files via DocumentService,
 * and returns the folder id.
 */
export async function attachEmploymentFiles(params: {
  prisma: PrismaService;
  documents: DocumentService;
  companyId: string;
  actorUserId: string;
  recordId: string;
  contextType: typeof FolderContextType.INACTIVE_PERIOD | typeof FolderContextType.EMPLOYMENT_SEPARATION;
  folderName: string;
  folderPath: string;
  existingFolderId: string | null | undefined;
  linkFolder: (folderId: string) => Promise<void>;
  files: UploadedEmploymentFile[];
}): Promise<string | null> {
  const files = params.files.filter((file) => file?.buffer?.length);
  if (files.length === 0) {
    return params.existingFolderId ?? null;
  }
  assertEmploymentFileCount(files);

  let folderId = params.existingFolderId ?? null;
  if (!folderId) {
    folderId = randomUUID();
    await params.prisma.documentFolder.create({
      data: {
        id: folderId,
        companyId: params.companyId,
        name: params.folderName,
        path: params.folderPath,
        contextType: params.contextType,
        contextId: params.recordId,
        isSystem: false,
        createdBy: params.actorUserId,
        updatedBy: params.actorUserId,
      },
    });
    await params.linkFolder(folderId);
  }

  const ctx = { companyId: params.companyId, userId: params.actorUserId };
  for (const file of files) {
    await params.documents.uploadDocument(ctx, folderId, file);
  }
  return folderId;
}

/**
 * True when the document belongs to an inactive or separation folder for this employee.
 */
export async function employmentDocumentBelongsToUser(
  prisma: PrismaService,
  companyId: string,
  userId: string,
  documentId: string,
): Promise<boolean> {
  const document = await prisma.document.findFirst({
    where: activeOnly({ id: documentId, companyId }),
    select: { folderId: true },
  });
  if (!document) {
    return false;
  }
  const [inactive, period] = await Promise.all([
    prisma.inactivePeriod.findFirst({
      where: {
        companyId,
        userId,
        attachmentFolderId: document.folderId,
      },
      select: { id: true },
    }),
    prisma.employmentPeriod.findFirst({
      where: {
        companyId,
        userId,
        attachmentFolderId: document.folderId,
      },
      select: { id: true },
    }),
  ]);
  return Boolean(inactive || period);
}
