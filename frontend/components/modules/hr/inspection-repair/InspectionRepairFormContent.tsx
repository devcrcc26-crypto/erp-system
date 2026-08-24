'use client';

import { useRouter } from 'next/navigation';
import InspectionRepairForm from '@/components/modules/hr/inspection-repair/InspectionRepairForm';
import type { InspectionRepairDetail } from '@/lib/api/inspection-repair.types';

export default function InspectionRepairFormContent(): React.ReactNode {
  const router = useRouter();

  function handleSuccess(created: InspectionRepairDetail): void {
    router.push(`/hr/inspection-repair/${created.id}`);
  }

  return <InspectionRepairForm onSuccess={handleSuccess} />;
}
