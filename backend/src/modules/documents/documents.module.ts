import { Module } from '@nestjs/common';
import { DocumentAccessController } from './presentation/controllers/document-access.controller';
import {
  DocumentFoldersController,
} from './presentation/controllers/document-folders.controller';
import {
  DocumentUploadController,
  DocumentsController,
} from './presentation/controllers/documents.controller';
import { DocumentService } from './application/services/document.service';

@Module({
  controllers: [
    DocumentFoldersController,
    DocumentsController,
    DocumentUploadController,
    DocumentAccessController,
  ],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentsModule {}
