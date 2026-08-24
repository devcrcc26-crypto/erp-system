'use client';

import { Alert, Button } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import { useCanManageEmployeePerDiemRates } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export default function EmployeePerDiemRatesEditPageContent({
  employeeId,
}: {
  employeeId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();

  if (!canManagePerDiemRates) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex items-center gap-3 mb-1">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/employee-per-diem-rates')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.backToList')}
        </Button>
      </div>

      <EmployeePerDiemRatesSection employeeId={employeeId} editable embedded={false} />
    </div>
  );
}

