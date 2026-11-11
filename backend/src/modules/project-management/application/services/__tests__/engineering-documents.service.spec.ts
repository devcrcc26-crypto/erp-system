import { BadRequestException } from '@nestjs/common';
import { EngineeringDocumentType } from '@prisma/client';
import {
  EngineeringDocumentRepository,
  EngineeringDocumentVersionRepository,
  TaskDisciplineScopeRepository,
} from '../../../infrastructure/repositories/epc-storage.repository';
import { PmContext } from '../../types/pm-context.type';
import { ConflictGuardService } from '../conflict-guard.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { EngineeringDocumentsService } from '../engineering-documents.service';
import { WorkflowEventLogService } from '../workflow-event-log.service';
import { WorkflowKernelService } from '../workflow-kernel.service';

describe('EngineeringDocumentsService registerFromUpload', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const taskDisciplineId = 'discipline-1';

  let engineeringDocumentRepository: {
    createWithInitialCurrentVersion: jest.Mock;
    findById: jest.Mock;
  };
  let taskDisciplineScopeRepository: {
    findScoped: jest.Mock;
    findDocumentVersion: jest.Mock;
  };
  let folderService: { ensureDisciplineFolder: jest.Mock };
  let service: EngineeringDocumentsService;

  beforeEach(() => {
    engineeringDocumentRepository = {
      createWithInitialCurrentVersion: jest.fn(),
      findById: jest.fn(),
    };
    taskDisciplineScopeRepository = {
      findScoped: jest.fn().mockResolvedValue({
        id: taskDisciplineId,
        disciplineName: 'Structural',
        taskId: 'task-1',
      }),
      findDocumentVersion: jest.fn().mockResolvedValue({
        id: 'doc-version-1',
      }),
    };
    folderService = {
      ensureDisciplineFolder: jest.fn().mockResolvedValue({ id: 'folder-1' }),
    };

    service = new EngineeringDocumentsService(
      engineeringDocumentRepository as unknown as EngineeringDocumentRepository,
      {} as unknown as EngineeringDocumentVersionRepository,
      taskDisciplineScopeRepository as unknown as TaskDisciplineScopeRepository,
      folderService as unknown as EngineeringDocumentFolderService,
      {} as unknown as ConflictGuardService,
      { logCrud: jest.fn() } as unknown as WorkflowEventLogService,
      {} as unknown as WorkflowKernelService,
      { getVersionDownloadUrl: jest.fn() } as never,
      { engineeringDocumentVersion: { findFirst: jest.fn() } } as never,
    );
  });

  it('throws BadRequestException when documentNumber is missing', async () => {
    await expect(
      service.registerFromUpload(ctx, projectId, taskDisciplineId, {
        documentVersionId: 'doc-version-1',
        documentType: EngineeringDocumentType.DRAWING,
        title: 'Foundation Plan',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Document number is required for engineering documents.',
      ),
    );

    expect(
      engineeringDocumentRepository.createWithInitialCurrentVersion,
    ).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when documentNumber is empty', async () => {
    await expect(
      service.registerFromUpload(ctx, projectId, taskDisciplineId, {
        documentVersionId: 'doc-version-1',
        documentType: EngineeringDocumentType.DRAWING,
        title: 'Foundation Plan',
        documentNumber: '   ',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Document number is required for engineering documents.',
      ),
    );

    expect(
      engineeringDocumentRepository.createWithInitialCurrentVersion,
    ).not.toHaveBeenCalled();
  });
});
