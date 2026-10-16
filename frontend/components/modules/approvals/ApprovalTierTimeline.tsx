'use client';

import { CheckCircle2, Circle, Clock3, RotateCcw, XCircle } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import {
  approvalTierDecisionVariant,
  findCurrentTier,
  formatApprovalStatus,
  formatApprovalUserName,
  parseTierConditions,
} from '@/lib/utils/approval-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

import './approvals-v2.css';

export interface ApprovalTierTimelineProps {
  tiers: ApprovalTier[];
  currentTier: number;
  title?: string;
}

type TierCardState =
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'current'
  | 'pending';

function resolveTierState(
  tier: ApprovalTier,
  isCurrent: boolean,
): TierCardState {
  if (tier.decision === 'APPROVED') return 'approved';
  if (tier.decision === 'REJECTED') return 'rejected';
  if (tier.decision === 'RETURNED') return 'returned';
  if (isCurrent) return 'current';
  return 'pending';
}

function TierStateIcon({
  state,
}: {
  state: TierCardState;
}): React.ReactNode {
  if (state === 'approved') {
    return <CheckCircle2 size={16} strokeWidth={2} aria-hidden />;
  }
  if (state === 'rejected') {
    return <XCircle size={16} strokeWidth={2} aria-hidden />;
  }
  if (state === 'returned') {
    return <RotateCcw size={16} strokeWidth={2} aria-hidden />;
  }
  if (state === 'current') {
    return <Clock3 size={16} strokeWidth={2} aria-hidden />;
  }
  return <Circle size={16} strokeWidth={2} aria-hidden />;
}

/**
 * Read-only approval tier chain as soft cards (shared by Approvals and HR detail).
 */
export default function ApprovalTierTimeline({
  tiers,
  currentTier: currentTierOrder,
  title,
}: ApprovalTierTimelineProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const sorted = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder);
  const currentTier = findCurrentTier(sorted, currentTierOrder);
  const resolvedTitle = title ?? t('hr.section.approvalChain');

  return (
    <div className="erp-approval-chain lg:sticky lg:top-4">
      <div className="erp-approval-chain-header">
        <h3 className="erp-approval-chain-title">{resolvedTitle}</h3>
      </div>
      <div className="erp-approval-chain-body">
        {sorted.length === 0 ? (
          <p className="erp-users-cell-sub m-0">
            {t('hr.empty.noApprovalChain')}
          </p>
        ) : (
          sorted.map((tier) => {
            const conditions = parseTierConditions(tier.conditions);
            const isCurrent = tier.id === currentTier?.id;
            const state = resolveTierState(tier, isCurrent);

            return (
              <article
                key={tier.id}
                className="erp-approval-tier-card"
                data-state={state}
              >
                <span className="erp-approval-tier-index" aria-hidden>
                  <TierStateIcon state={state} />
                </span>
                <div className="erp-approval-tier-main">
                  <div className="erp-approval-tier-top">
                    <p className="erp-approval-tier-label">{tier.label}</p>
                    <StatusBadge
                      label={formatApprovalStatus(tier.decision, t)}
                      variant={approvalTierDecisionVariant(tier.decision)}
                    />
                    {isCurrent ? (
                      <StatusBadge
                        label={t('pages.approvals.currentTierBadge')}
                        variant="cyan"
                      />
                    ) : null}
                  </div>
                  <p className="erp-approval-tier-meta">
                    {formatApprovalUserName(tier.approver)}
                    {tier.resolver ? ` · ${tier.resolver}` : ''}
                  </p>
                  {tier.decidedAt ? (
                    <p className="erp-approval-tier-meta">
                      {t('pages.approvals.decidedOn', {
                        date: formatProjectDate(tier.decidedAt),
                      })}
                    </p>
                  ) : null}
                  {tier.comment ? (
                    <p className="erp-approval-tier-comment">{tier.comment}</p>
                  ) : null}
                  {conditions.length > 0 ? (
                    <div className="mt-1 flex flex-col gap-2">
                      {conditions.map((condition, index) => (
                        <div
                          key={`${tier.id}-c-${index}`}
                          className="erp-approval-condition"
                          data-resolved={condition.resolved ? 'true' : 'false'}
                        >
                          <p className="erp-approval-condition-text">
                            {condition.resolved ? '✓ ' : '○ '}
                            {condition.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
