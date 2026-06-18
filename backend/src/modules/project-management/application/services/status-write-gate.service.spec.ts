import { BadRequestException, ConflictException } from '@nestjs/common';
import { StatusWriteGateService } from './status-write-gate.service';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';

describe('StatusWriteGateService', () => {
  const gate = new StatusWriteGateService();

  it('allows DRAFT → IN_REVIEW', () => {
    expect(() =>
      gate.assertTransition({ from: EdvStatus.DRAFT, to: EdvStatus.IN_REVIEW }),
    ).not.toThrow();
  });

  it('rejects DRAFT → LOCKED', () => {
    expect(() =>
      gate.assertTransition({ from: EdvStatus.DRAFT, to: EdvStatus.LOCKED }),
    ).toThrow(BadRequestException);
  });

  it('rejects LOCKED → DRAFT with conflict', () => {
    expect(() =>
      gate.assertTransition({ from: EdvStatus.LOCKED, to: EdvStatus.DRAFT }),
    ).toThrow(ConflictException);
  });
});
