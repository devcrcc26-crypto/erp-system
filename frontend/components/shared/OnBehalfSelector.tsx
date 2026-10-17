'use client';

import { useMemo, useState } from 'react';
import { Avatar, Checkbox, Select, Typography } from 'antd';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  OnBehalfEligibleEmployee,
  OnBehalfModuleCode,
  OnBehalfPayload,
} from '@/lib/api/on-behalf.types';
import {
  useOnBehalfChainMembership,
  useOnBehalfEligibleEmployees,
} from '@/lib/query/on-behalf';
import { useCurrentUser } from '@/lib/query/profile';

export function formatOnBehalfEmployeeName(
  employee: Pick<
    OnBehalfEligibleEmployee,
    'firstName' | 'middleName' | 'lastName' | 'employeeId'
  >,
  options?: { includeEmployeeId?: boolean },
): string {
  const name = [employee.firstName, employee.middleName, employee.lastName]
    .filter((part) => Boolean(part && String(part).trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (options?.includeEmployeeId !== false && employee.employeeId) {
    return `${name} · ${employee.employeeId}`;
  }
  return name;
}

function initials(employee: OnBehalfEligibleEmployee): string {
  const last = employee.lastName || employee.middleName || '';
  return `${employee.firstName.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/**
 * Form-level on-behalf state. Spread `payload` into the create request body
 * (or pass it to `appendOnBehalfFields` for multipart bodies).
 */
export function useOnBehalf(moduleCode: OnBehalfModuleCode) {
  const currentUser = useCurrentUser();
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [autoApproveTier, setAutoApproveTier] = useState(false);
  const eligibleQuery = useOnBehalfEligibleEmployees(
    currentUser.data?.id,
    currentUser.data?.companyId,
  );

  const employee = useMemo(
    () => eligibleQuery.data?.find((row) => row.id === employeeId),
    [eligibleQuery.data, employeeId],
  );

  const payload: OnBehalfPayload = employeeId
    ? { onBehalfOfEmployeeId: employeeId, autoApproveTier }
    : {};

  return {
    moduleCode,
    companyId: currentUser.data?.companyId,
    employeeId,
    setEmployeeId,
    autoApproveTier,
    setAutoApproveTier,
    /** Selected target employee (undefined for self-submission). */
    employee,
    /** Target for employee-scoped lookups: the selected employee, else the signed-in user. */
    effectiveEmployeeId: employeeId ?? currentUser.data?.id,
    payload,
    reset: (): void => {
      setEmployeeId(undefined);
      setAutoApproveTier(false);
    },
  };
}

export type OnBehalfState = ReturnType<typeof useOnBehalf>;

interface OnBehalfSelectorProps {
  /** Selected employee id (undefined = submitting for yourself). */
  value?: string;
  onChange: (id: string | undefined) => void;
  /** Scopes the cached eligible list; defaults to the signed-in user's company. */
  companyId?: string;
  moduleCode: OnBehalfModuleCode;
  autoApproveTier: boolean;
  onAutoApproveTierChange: (value: boolean) => void;
}

/**
 * "Submission details" card for HR request create forms.
 * Renders nothing for users without on-behalf access.
 */
export default function OnBehalfSelector({
  value,
  onChange,
  companyId,
  moduleCode,
  autoApproveTier,
  onAutoApproveTierChange,
}: OnBehalfSelectorProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const currentUser = useCurrentUser();
  const eligibleQuery = useOnBehalfEligibleEmployees(
    currentUser.data?.id,
    companyId ?? currentUser.data?.companyId,
  );
  const chainQuery = useOnBehalfChainMembership(value, moduleCode);
  const [enabled, setEnabled] = useState(Boolean(value));

  const employees = useMemo(() => eligibleQuery.data ?? [], [eligibleQuery.data]);
  const selected = employees.find((row) => row.id === value);

  const options = useMemo(
    () =>
      employees.map((employee) => {
        const label = formatOnBehalfEmployeeName(employee);
        const nameOnly = formatOnBehalfEmployeeName(employee, {
          includeEmployeeId: false,
        });
        return {
          value: employee.id,
          label,
          searchText: [
            nameOnly,
            employee.firstName,
            employee.middleName,
            employee.lastName,
            employee.employeeId,
            employee.department,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
          employee,
        };
      }),
    [employees],
  );

  if (employees.length === 0) {
    return null;
  }

  const isOnBehalf = enabled && Boolean(selected);
  const showAutoApprove =
    isOnBehalf &&
    chainQuery.data?.isInChain === true &&
    chainQuery.data?.autoApproveAllowed !== false;

  return (
    <div className="flex flex-col gap-4">
      <FormLayout
        variant="pro"
        title={t('hr.onBehalf.title')}
        description={t('hr.onBehalf.description')}
      >
        <Checkbox
          checked={enabled}
          onChange={(event) => {
            const next = event.target.checked;
            setEnabled(next);
            if (!next) {
              onChange(undefined);
            }
          }}
        >
          {t('hr.onBehalf.toggle')}
        </Checkbox>

        {enabled ? (
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <Typography.Text className="mb-1 block text-sm font-medium">
                {t('hr.onBehalf.employee')}
              </Typography.Text>
              <Select
                className="w-full"
                showSearch
                allowClear
                value={value}
                placeholder={t('hr.onBehalf.placeholder')}
                notFoundContent={t('hr.onBehalf.noResults')}
                options={options}
                optionLabelProp="label"
                filterOption={(input, option) =>
                  (option?.searchText ?? '').includes(input.trim().toLowerCase())
                }
                optionRender={(option) => {
                  const employee = option.data.employee;
                  return (
                    <div className="flex min-w-0 items-center gap-2 py-0.5">
                      <Avatar size="small">{initials(employee)}</Avatar>
                      <div className="min-w-0">
                        <div className="truncate">
                          {formatOnBehalfEmployeeName(employee, {
                            includeEmployeeId: false,
                          })}
                        </div>
                        <div className="truncate text-xs opacity-60">
                          {[employee.employeeId, employee.department]
                            .filter(Boolean)
                            .join(' · ') || '-'}
                        </div>
                      </div>
                    </div>
                  );
                }}
                onChange={(id: string | undefined) => {
                  onChange(id);
                  onAutoApproveTierChange(false);
                }}
              />
            </div>

            {showAutoApprove ? (
              <div>
                <Checkbox
                  checked={autoApproveTier}
                  onChange={(event) =>
                    onAutoApproveTierChange(event.target.checked)
                  }
                >
                  {t('hr.onBehalf.autoApprove')}
                </Checkbox>
                <Typography.Paragraph
                  type="secondary"
                  className="!mb-0 !mt-1 pl-6 text-xs"
                >
                  {t('hr.onBehalf.autoApproveHint', {
                    tier: chainQuery.data?.tierLabel ?? '',
                  })}
                </Typography.Paragraph>
              </div>
            ) : null}
          </div>
        ) : null}
      </FormLayout>

      {isOnBehalf && selected ? (
        <ErpNotice
          tone="info"
          title={t('hr.onBehalf.bannerTitle', {
            name: formatOnBehalfEmployeeName(selected),
          })}
          description={t('hr.onBehalf.bannerDescription')}
        />
      ) : null}
    </div>
  );
}

/**
 * Convenience wrapper wiring `OnBehalfSelector` to `useOnBehalf` state.
 */
export function OnBehalfSection({
  state,
}: {
  state: OnBehalfState;
}): React.ReactNode {
  return (
    <OnBehalfSelector
      value={state.employeeId}
      onChange={state.setEmployeeId}
      companyId={state.companyId}
      moduleCode={state.moduleCode}
      autoApproveTier={state.autoApproveTier}
      onAutoApproveTierChange={state.setAutoApproveTier}
    />
  );
}
