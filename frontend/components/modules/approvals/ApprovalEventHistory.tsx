'use client';

import { useMemo } from 'react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  ApprovalRequestDetail,
  ApprovalResponse,
  ApprovalTier,
  ApprovalUserSummary,
} from '@/lib/api/approvals.types';
import { formatApprovalUserName } from '@/lib/utils/approval-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { DocumentPreviewGroup } from '@/components/shared/preview';

export interface ApprovalHistoryEvent {
  id: string;
  at: string;
  action: string;
  actorName: string;
  tier?: number;
  note?: string | null;
  documents?: ApprovalResponse['documents'];
}

function actorLabel(
  user: ApprovalUserSummary | null | undefined,
  fallback: string,
): string {
  if (!user) {
    return fallback;
  }
  return formatApprovalUserName(user);
}

/**
 * Builds a chronological history from submit + tier decisions + responses.
 * Reuses ApprovalResponse / ApprovalTier — no separate RequestHistory table.
 */
export function buildApprovalHistoryEvents(input: {
  request: Pick<
    ApprovalRequestDetail,
    'id' | 'createdAt' | 'submittedAt' | 'completedAt' | 'status' | 'requester'
  >;
  tiers: ApprovalTier[];
  responses: ApprovalResponse[];
  submittedLabel: string;
  cancelledLabel: string;
  unknownActor: string;
}): ApprovalHistoryEvent[] {
  const events: ApprovalHistoryEvent[] = [];
  const requesterName = actorLabel(input.request.requester, input.unknownActor);

  events.push({
    id: `submitted-${input.request.id}`,
    at: input.request.submittedAt ?? input.request.createdAt,
    action: input.submittedLabel,
    actorName: requesterName,
  });

  for (const tier of input.tiers) {
    if (!tier.decidedAt || tier.decision === 'PENDING') {
      continue;
    }
    const actor =
      tier.actingApprover ??
      tier.approver ??
      null;
    events.push({
      id: `tier-${tier.id}-${tier.decision}`,
      at: tier.decidedAt,
      action: tier.decision,
      actorName: actorLabel(actor, input.unknownActor),
      tier: tier.tierOrder,
      note: tier.comment,
    });
  }

  for (const response of input.responses) {
    // RETURNED is also reflected on the tier; keep the response note durable.
    events.push({
      id: `response-${response.id}`,
      at: response.createdAt,
      action: response.responseType,
      actorName: actorLabel(response.responder, input.unknownActor),
      note: response.note,
      documents: response.documents,
    });
  }

  if (input.request.status === 'CANCELLED' && input.request.completedAt) {
    events.push({
      id: `cancelled-${input.request.id}`,
      at: input.request.completedAt,
      action: 'CANCELLED',
      actorName: requesterName,
    });
  }

  return events.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

function formatActionLabel(
  action: string,
  tier: number | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  switch (action) {
    case 'SUBMITTED':
      return t('pages.approvals.history.submitted');
    case 'APPROVED':
      return tier != null
        ? t('pages.approvals.history.approvedTier', { tier })
        : t('pages.approvals.history.approved');
    case 'RETURNED':
      return tier != null
        ? t('pages.approvals.history.returnedTier', { tier })
        : t('pages.approvals.history.returned');
    case 'REJECTED':
      return tier != null
        ? t('pages.approvals.history.rejectedTier', { tier })
        : t('pages.approvals.history.rejected');
    case 'RESUBMIT':
      return t('pages.approvals.history.resubmitted');
    case 'CONDITION_RESPONSE':
      return t('pages.approvals.history.conditionResponse');
    case 'CANCELLED':
      return t('pages.approvals.history.cancelled');
    case 'SKIPPED':
      return tier != null
        ? t('pages.approvals.history.skippedTier', { tier })
        : t('pages.approvals.history.skipped');
    case 'CONDITIONALLY_APPROVED':
      return tier != null
        ? t('pages.approvals.history.conditionallyApprovedTier', { tier })
        : t('pages.approvals.history.conditionallyApproved');
    default:
      return action;
  }
}

/**
 * Chronological request history (submit / approve / return / resubmit / cancel).
 */
export default function ApprovalEventHistory({
  request,
  tiers,
  responses,
}: {
  request: Pick<
    ApprovalRequestDetail,
    'id' | 'createdAt' | 'submittedAt' | 'completedAt' | 'status' | 'requester'
  >;
  tiers: ApprovalTier[];
  responses: ApprovalResponse[];
}): React.ReactNode {
  const { t } = useEpcTranslation();

  const events = useMemo(
    () =>
      buildApprovalHistoryEvents({
        request,
        tiers,
        responses,
        submittedLabel: 'SUBMITTED',
        cancelledLabel: 'CANCELLED',
        unknownActor: t('common.defaultUser'),
      }),
    [request, tiers, responses, t],
  );

  // Deduplicate RETURNED (tier + response) when timestamps match closely.
  const deduped = useMemo(() => {
    const out: ApprovalHistoryEvent[] = [];
    for (const event of events) {
      const prev = out[out.length - 1];
      if (
        prev &&
        prev.action === 'RETURNED' &&
        event.action === 'RETURNED' &&
        Math.abs(new Date(prev.at).getTime() - new Date(event.at).getTime()) <
          5000
      ) {
        if (!prev.note && event.note) {
          prev.note = event.note;
        }
        continue;
      }
      out.push({ ...event });
    }
    return out;
  }, [events]);

  if (deduped.length === 0) {
    return null;
  }

  return (
    <section
      className="erp-resubmit-history"
      aria-labelledby="erp-approval-history-title"
    >
      <div className="erp-resubmit-history-header">
        <h3 id="erp-approval-history-title" className="erp-resubmit-history-title">
          {t('pages.approvals.history.title')}
        </h3>
        <span className="erp-users-count-pill">
          {deduped.length.toLocaleString()}
        </span>
      </div>
      <ul className="erp-resubmit-history-list">
        {deduped.map((event) => (
          <li key={event.id} className="erp-resubmit-history-item">
            <div className="erp-resubmit-history-item-top">
              <p className="erp-resubmit-history-item-label">
                {formatActionLabel(event.action, event.tier, t)}
              </p>
              <p className="erp-resubmit-history-item-meta">
                {event.actorName} · {formatDisplayDateTime(event.at)}
              </p>
            </div>
            {event.note?.trim() ? (
              <p className="erp-resubmit-history-item-note">{event.note}</p>
            ) : null}
            {(event.documents?.length ?? 0) > 0 ? (
              <div className="erp-resubmit-history-item-docs">
                <DocumentPreviewGroup
                  documents={event.documents?.map((link) => ({
                    id: link.documentId,
                    name:
                      link.document?.name ??
                      t('pages.approvals.resubmit.attachment'),
                    fileType: link.document?.fileType,
                    fileSizeBytes: link.document?.fileSizeBytes,
                  }))}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
