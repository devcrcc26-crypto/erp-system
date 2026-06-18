import { ConflictException } from '@nestjs/common';
import { CommentStatus } from '../../domain/contracts/enums/comment-status.enum';
import { DefinitionOfDoneService } from './definition-of-done.service';

describe('DefinitionOfDoneService', () => {
  const service = new DefinitionOfDoneService();

  it('allows approval when all comments VERIFIED or CLOSED', () => {
    expect(() =>
      service.assertPackageApprovalAllowed([
        CommentStatus.VERIFIED,
        CommentStatus.CLOSED,
      ]),
    ).not.toThrow();
  });

  it('blocks approval when RESOLVED comments remain', () => {
    expect(() =>
      service.assertPackageApprovalAllowed([
        CommentStatus.RESOLVED,
        CommentStatus.VERIFIED,
      ]),
    ).toThrow(ConflictException);
  });

  it('blocks session close when OPEN comments remain', () => {
    expect(() =>
      service.assertSessionCloseAllowed([CommentStatus.OPEN]),
    ).toThrow(ConflictException);
  });
});
