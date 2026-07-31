'use client';

import { Space, Timeline, Typography } from 'antd';
import { CheckCircle2, Circle, Clock3 } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { tokens } from '@/lib/theme/tokens';
import {
  approvalTierDecisionVariant,
  findCurrentTier,
  formatApprovalStatus,
  formatApprovalUserName,
  parseTierConditions,
} from '@/lib/utils/approval-display';
import { formatProjectDate } from '@/lib/utils/project-display';

export interface ApprovalTierTimelineProps {
  tiers: ApprovalTier[];
  currentTier: number;
  title?: string;
}

/**
 * Read-only approval tier chain timeline (shared by Approvals and Leave detail).
 */
export default function ApprovalTierTimeline({
  tiers,
  currentTier: currentTierOrder,
  title = 'Approval chain',
}: ApprovalTierTimelineProps): React.ReactNode {
  const sorted = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder);
  const currentTier = findCurrentTier(sorted, currentTierOrder);

  return (
    <aside
      style={{
        background: tokens.colorCardBg,
        border: `1px solid ${tokens.colorBorder}`,
        borderRadius: 8,
        padding: 20,
        position: 'sticky',
        top: 16,
      }}
    >
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {title}
      </Typography.Title>

      {sorted.length === 0 ? (
        <Typography.Text type="secondary">No approval tiers.</Typography.Text>
      ) : (
        <Timeline
          items={sorted.map((tier) => {
            const conditions = parseTierConditions(tier.conditions);
            const isCurrent = tier.id === currentTier?.id;
            return {
              color:
                tier.decision === 'APPROVED'
                  ? 'green'
                  : tier.decision === 'REJECTED'
                    ? 'red'
                    : tier.decision === 'RETURNED'
                      ? 'orange'
                      : isCurrent
                        ? 'blue'
                        : 'gray',
              dot:
                tier.decision === 'APPROVED' ? (
                  <CheckCircle2 size={16} color={tokens.colorGreen600} />
                ) : tier.decision === 'PENDING' ? (
                  <Clock3 size={16} color={tokens.colorAmber400} />
                ) : (
                  <Circle size={14} color={tokens.colorGray600} />
                ),
              content: (
                <div style={{ paddingBottom: 8 }}>
                  <Space wrap size={6}>
                    <Typography.Text strong>{tier.label}</Typography.Text>
                    <StatusBadge
                      label={formatApprovalStatus(tier.decision)}
                      variant={approvalTierDecisionVariant(tier.decision)}
                    />
                    {isCurrent ? (
                      <StatusBadge label="Current" variant="cyan" />
                    ) : null}
                  </Space>
                  <div style={{ marginTop: 4 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {formatApprovalUserName(tier.approver)}
                      {tier.resolver ? ` · ${tier.resolver}` : ''}
                    </Typography.Text>
                  </div>
                  {tier.decidedAt ? (
                    <div>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        Decided {formatProjectDate(tier.decidedAt)}
                      </Typography.Text>
                    </div>
                  ) : null}
                  {tier.comment ? (
                    <Typography.Paragraph
                      type="secondary"
                      style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}
                    >
                      {tier.comment}
                    </Typography.Paragraph>
                  ) : null}
                  {conditions.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      <Typography.Text
                        strong
                        style={{ fontSize: 12, display: 'block' }}
                      >
                        Conditions
                      </Typography.Text>
                      {conditions.map((condition, index) => (
                        <div
                          key={`${tier.id}-c-${index}`}
                          style={{
                            marginTop: 6,
                            padding: 8,
                            borderRadius: 6,
                            background: condition.resolved
                              ? tokens.colorGreen50
                              : tokens.colorAmber50,
                          }}
                        >
                          <Typography.Text style={{ fontSize: 12 }}>
                            {condition.resolved ? '✓ ' : '○ '}
                            {condition.text}
                          </Typography.Text>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            };
          })}
        />
      )}
    </aside>
  );
}
