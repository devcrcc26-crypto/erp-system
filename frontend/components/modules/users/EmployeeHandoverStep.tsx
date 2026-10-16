'use client';

import { Alert, Input, Radio, Segmented } from 'antd';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  HandoverPayload,
  HandoverRequirements,
  LeadershipKind,
} from '@/lib/api/employment';

/** Replacement or skip reason per item, keyed by tier id / `${kind}:${id}`. */
interface Decision {
  mode: 'replace' | 'skip';
  replacementId?: string;
  skipReason?: string;
}

export interface HandoverState {
  tiers: Record<string, Decision>;
  leadership: Record<string, Decision>;
  submittedRequests: Record<string, 'CANCEL' | 'KEEP'>;
}

export const emptyHandoverState: HandoverState = {
  tiers: {},
  leadership: {},
  submittedRequests: {},
};

const MIN_SKIP_REASON = 3;

function leadershipKey(kind: LeadershipKind, id: string): string {
  return `${kind}:${id}`;
}

function decided(decision: Decision | undefined): boolean {
  if (!decision) return false;
  return decision.mode === 'replace'
    ? Boolean(decision.replacementId)
    : (decision.skipReason?.trim().length ?? 0) >= MIN_SKIP_REASON;
}

export function handoverItemCount(requirements: HandoverRequirements): number {
  return (
    requirements.tiers.length +
    requirements.leadership.length +
    requirements.submittedRequests.length
  );
}

/** Mirrors the backend `missingHandover` rule. */
export function handoverComplete(
  requirements: HandoverRequirements,
  state: HandoverState,
): boolean {
  return (
    requirements.tiers.every((tier) => decided(state.tiers[tier.tierId])) &&
    requirements.leadership.every((item) =>
      decided(state.leadership[leadershipKey(item.kind, item.id)]),
    ) &&
    requirements.submittedRequests.every((req) =>
      Boolean(state.submittedRequests[req.requestId]),
    )
  );
}

function toDecision(id: string, decision: Decision | undefined) {
  return decision?.mode === 'replace'
    ? { id, replacementId: decision.replacementId ?? null }
    : { id, skipReason: decision?.skipReason?.trim() ?? null };
}

export function toHandoverPayload(
  requirements: HandoverRequirements,
  state: HandoverState,
): HandoverPayload {
  return {
    tiers: requirements.tiers.map((tier) => toDecision(tier.tierId, state.tiers[tier.tierId])),
    leadership: requirements.leadership.map((item) => ({
      kind: item.kind,
      ...toDecision(item.id, state.leadership[leadershipKey(item.kind, item.id)]),
    })),
    submittedRequests: requirements.submittedRequests.map((req) => ({
      requestId: req.requestId,
      action: state.submittedRequests[req.requestId] ?? 'KEEP',
    })),
  };
}

function DecisionRow({
  title,
  subtitle,
  decision,
  excludeUserIds,
  onChange,
}: {
  title: string;
  subtitle?: string;
  decision: Decision | undefined;
  excludeUserIds: string[];
  onChange: (next: Decision) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const mode = decision?.mode ?? 'replace';
  return (
    <li className="flex flex-col gap-2 rounded-md border border-[var(--erp-border,#E5E7EB)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          {subtitle ? (
            <div className="text-xs text-[var(--erp-text-secondary,#4B5563)]">{subtitle}</div>
          ) : null}
        </div>
        <Segmented
          size="small"
          value={mode}
          onChange={(value) => onChange({ ...decision, mode: value as Decision['mode'] })}
          options={[
            { value: 'replace', label: t('users.separation.handoverReplace') },
            { value: 'skip', label: t('users.separation.handoverSkip') },
          ]}
        />
      </div>
      {mode === 'replace' ? (
        <UserSelect
          activeEmploymentOnly
          value={decision?.replacementId}
          excludeUserIds={excludeUserIds}
          placeholder={t('users.separation.handoverPickReplacement')}
          onChange={(value) =>
            onChange({
              mode: 'replace',
              replacementId: typeof value === 'string' ? value : undefined,
            })
          }
        />
      ) : (
        <Input
          value={decision?.skipReason}
          maxLength={500}
          placeholder={t('users.separation.handoverSkipReason')}
          status={
            decision?.skipReason !== undefined &&
            decision.skipReason.trim().length < MIN_SKIP_REASON
              ? 'error'
              : undefined
          }
          onChange={(event) => onChange({ mode: 'skip', skipReason: event.target.value })}
        />
      )}
    </li>
  );
}

/**
 * Separation handover: each pending approval tier and leader/approver role gets
 * a replacement (or a skip reason); each pending request they submitted is
 * cancelled or kept.
 */
export default function EmployeeHandoverStep({
  userId,
  requirements,
  value,
  onChange,
}: {
  userId: string;
  requirements: HandoverRequirements;
  value: HandoverState;
  onChange: (next: HandoverState) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const exclude = [userId];
  const complete = handoverComplete(requirements, value);

  return (
    <div className="flex flex-col gap-4">
      <Alert
        type={complete ? 'success' : 'info'}
        showIcon
        title={
          complete ? t('users.separation.handoverComplete') : t('users.separation.handoverIntro')
        }
      />

      {requirements.tiers.length > 0 ? (
        <section>
          <h4 className="m-0 mb-2 text-sm font-semibold">
            {t('users.separation.handoverTiers', { count: requirements.tiers.length })}
          </h4>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {requirements.tiers.map((tier) => (
              <DecisionRow
                key={tier.tierId}
                title={`${tier.requestNumber} · ${tier.title}`}
                subtitle={tier.tierLabel}
                decision={value.tiers[tier.tierId]}
                excludeUserIds={exclude}
                onChange={(next) =>
                  onChange({ ...value, tiers: { ...value.tiers, [tier.tierId]: next } })
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      {requirements.leadership.length > 0 ? (
        <section>
          <h4 className="m-0 mb-2 text-sm font-semibold">
            {t('users.separation.handoverRoles', { count: requirements.leadership.length })}
          </h4>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {requirements.leadership.map((item) => {
              const key = leadershipKey(item.kind, item.id);
              return (
                <DecisionRow
                  key={key}
                  title={item.name}
                  subtitle={t(`users.separation.leadershipKinds.${item.kind}`)}
                  decision={value.leadership[key]}
                  excludeUserIds={exclude}
                  onChange={(next) =>
                    onChange({ ...value, leadership: { ...value.leadership, [key]: next } })
                  }
                />
              );
            })}
          </ul>
        </section>
      ) : null}

      {requirements.submittedRequests.length > 0 ? (
        <section>
          <h4 className="m-0 mb-2 text-sm font-semibold">
            {t('users.separation.handoverSubmitted', {
              count: requirements.submittedRequests.length,
            })}
          </h4>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {requirements.submittedRequests.map((req) => (
              <li
                key={req.requestId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--erp-border,#E5E7EB)] p-3"
              >
                <span className="min-w-0 font-medium">
                  {req.requestNumber} · {req.title}
                </span>
                <Radio.Group
                  size="small"
                  optionType="button"
                  value={value.submittedRequests[req.requestId]}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      submittedRequests: {
                        ...value.submittedRequests,
                        [req.requestId]: event.target.value as 'CANCEL' | 'KEEP',
                      },
                    })
                  }
                  options={[
                    { value: 'KEEP', label: t('users.separation.handoverKeep') },
                    { value: 'CANCEL', label: t('users.separation.handoverCancelRequest') },
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
