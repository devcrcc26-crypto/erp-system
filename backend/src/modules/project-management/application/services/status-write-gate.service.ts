import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import {
  canTransitionEdvStatus,
  EdvTransitionResult,
} from '../../domain/edv-state-machine';

export interface StatusWriteGateInput {
  readonly from: EdvStatus;
  readonly to: EdvStatus;
}

/**
 * Enforces EDV state machine rules before persistence (write gate).
 */
@Injectable()
export class StatusWriteGateService {
  /**
   * Validates transition - throws on invalid.
   */
  assertTransition(input: StatusWriteGateInput): EdvTransitionResult {
    const result = canTransitionEdvStatus(input.from, input.to);
    if (!result.allowed) {
      if (
        result.code === 'LOCKED_IMMUTABLE' ||
        result.code === 'SUPERSEDED_IMMUTABLE'
      ) {
        throw new ConflictException(result.message);
      }
      throw new BadRequestException(result.message);
    }
    return result;
  }
}
