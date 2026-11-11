import { Injectable, Logger } from '@nestjs/common';
import type {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../ports/approval-decision.listener';

/**
 * Fan-out registry so leave, overtime, and future modules can all react
 * to terminal approval decisions without competing for a single DI token.
 */
@Injectable()
export class ApprovalDecisionRegistry {
  private readonly logger = new Logger(ApprovalDecisionRegistry.name);
  private readonly listeners = new Set<ApprovalDecisionListener>();

  /**
   * Registers a domain listener (idempotent for the same instance).
   */
  register(listener: ApprovalDecisionListener): void {
    this.listeners.add(listener);
  }

  /**
   * Unregisters a domain listener.
   */
  unregister(listener: ApprovalDecisionListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Notifies all registered listeners. Failures are logged and do not stop others.
   */
  async notify(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener.onApprovalDecision(approvalRequestId, decision);
      } catch (error: unknown) {
        this.logger.warn(
          `Approval decision listener failed for ${approvalRequestId} (${decision})`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
}
