'use client';

import { Alert, Spin } from 'antd';
import { FileSignature } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useMyActiveContract } from '@/lib/query/employee-contract';
import { formatDateWithPattern } from '@/lib/utils/date-format';
import {
  employeeContractStatusVariant,
  formatEmployeeContractStatus,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';
import {
  PROFILE_FIELD_GRID,
  ProfileEmptyState,
  ProfileField,
  ProfileSection,
  displayText,
} from '@/components/modules/profile/profile-display';

/**
 * My Profile → Contract: the employee's current ACTIVE contract, read-only.
 * The endpoint never returns pay fields, so none can render here.
 */
export default function ProfileContractTab({
  dateFormat,
}: {
  dateFormat: string | null | undefined;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const contractQuery = useMyActiveContract();
  const contract = contractQuery.data?.contract ?? null;

  return (
    <ProfileSection title={t('profile.contractTitle')}>
      {contractQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      ) : contractQuery.isError ? (
        <Alert type="error" showIcon title={t('profile.contractLoadError')} />
      ) : !contract ? (
        <ProfileEmptyState
          icon={<FileSignature size={22} strokeWidth={1.6} />}
          message={t('profile.noContract')}
        />
      ) : (
        <div className={PROFILE_FIELD_GRID}>
          <ProfileField label={t('profile.contractNumber')}>
            <span className="erp-users-id-chip">{contract.contractNumber}</span>
          </ProfileField>
          <ProfileField label={t('profile.contractType')}>
            {formatEmployeeContractType(contract.contractType, t)}
          </ProfileField>
          <ProfileField label={t('profile.contractStatus')}>
            <StatusBadge
              label={formatEmployeeContractStatus(contract.status, t)}
              variant={employeeContractStatusVariant(contract.status)}
            />
          </ProfileField>
          <ProfileField label={t('profile.contractSignedDate')}>
            {formatDateWithPattern(contract.signedAt, dateFormat)}
          </ProfileField>
          <ProfileField label={t('profile.contractStartDate')}>
            {formatDateWithPattern(contract.startDate, dateFormat)}
          </ProfileField>
          <ProfileField label={t('profile.contractEndDate')}>
            {contract.endDate
              ? formatDateWithPattern(contract.endDate, dateFormat)
              : t('profile.contractOpenEnded')}
          </ProfileField>
          <ProfileField label={t('profile.contractProbationEnd')}>
            {formatDateWithPattern(contract.probationEndDate, dateFormat)}
          </ProfileField>
          <ProfileField label={t('profile.contractGovernedBy')}>
            {displayText(contract.governedBy)}
          </ProfileField>
        </div>
      )}
    </ProfileSection>
  );
}
