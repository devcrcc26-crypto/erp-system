'use client';

import { useMemo, useState } from 'react';
import { Button, Select, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import FieldMovementForm from '@/components/modules/profile/FieldMovementForm';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useCurrentUser } from '@/lib/query/profile';
import { useMyFlaggedDays } from '@/lib/query/attendance';
import type { FlaggedDay } from '@/lib/api/attendance.types';

function previousPeriod(month: number, year: number): { month: number; year: number } {
  if (month <= 1) {
    return { month: 12, year: year - 1 };
  }
  return { month: month - 1, year };
}

/**
 * Dedicated New Request flow for field movement / early departure explanations.
 */
export default function FieldMovementNewRequestPageContent(): React.ReactNode {
  const router = useRouter();
  const now = new Date();
  const current = { month: now.getMonth() + 1, year: now.getFullYear() };
  const previous = previousPeriod(current.month, current.year);

  const [selectedPeriod, setSelectedPeriod] = useState<{
    month: number;
    year: number;
  } | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const profileQuery = useCurrentUser();
  const currentFlags = useMyFlaggedDays(current.month, current.year, true);
  const previousFlags = useMyFlaggedDays(previous.month, previous.year, true);

  const periodsWithFlags = useMemo(() => {
    const options: Array<{ month: number; year: number; days: FlaggedDay[] }> =
      [];
    if ((currentFlags.data?.flaggedDays.length ?? 0) > 0) {
      options.push({
        month: current.month,
        year: current.year,
        days: currentFlags.data!.flaggedDays,
      });
    }
    if ((previousFlags.data?.flaggedDays.length ?? 0) > 0) {
      options.push({
        month: previous.month,
        year: previous.year,
        days: previousFlags.data!.flaggedDays,
      });
    }
    return options;
  }, [
    current.month,
    current.year,
    previous.month,
    previous.year,
    currentFlags.data,
    previousFlags.data,
  ]);

  const activeFlags =
    selectedPeriod == null
      ? []
      : (periodsWithFlags.find(
          (period) =>
            period.month === selectedPeriod.month &&
            period.year === selectedPeriod.year,
        )?.days ?? []);

  const loading =
    currentFlags.isLoading ||
    previousFlags.isLoading ||
    profileQuery.isLoading;

  if (loading) {
    return (
      <div className="erp-pro-list-page erp-users-page flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (periodsWithFlags.length === 0) {
    return (
      <div className="erp-pro-list-page erp-users-page flex flex-col gap-4">
        <div className="flex justify-end">
          <Button onClick={() => router.push('/approvals/new')}>Back</Button>
        </div>
        <ErpNotice
          tone="info"
          title="No flagged days to explain"
          description="You do not have unresolved attendance flags for the current or previous month."
        />
      </div>
    );
  }

  const employeeId = profileQuery.data?.id ?? '';

  return (
    <div className="erp-pro-list-page erp-users-page flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-lg font-semibold text-[#1A1A1A]">
            Field Movement / Early Departure Log
          </h1>
          <p className="m-0 mt-1 text-sm text-[#6B7280]">
            Explain missing clock-ins, missing clock-outs, or early departures
            flagged in your monthly attendance.
          </p>
        </div>
        <Button onClick={() => router.push('/approvals/new')}>Back</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          style={{ minWidth: 200 }}
          allowClear
          placeholder="Select month"
          value={
            selectedPeriod
              ? `${selectedPeriod.year}-${selectedPeriod.month}`
              : undefined
          }
          options={periodsWithFlags.map((period) => ({
            value: `${period.year}-${period.month}`,
            label: `${new Date(period.year, period.month - 1, 1).toLocaleString('en', { month: 'long' })} ${period.year} (${period.days.length})`,
          }))}
          onChange={(value) => {
            if (!value) {
              setSelectedPeriod(null);
              setFormOpen(false);
              return;
            }
            const [yearPart, monthPart] = value.split('-');
            setSelectedPeriod({
              year: Number(yearPart),
              month: Number(monthPart),
            });
          }}
        />
        <Button
          type="primary"
          disabled={
            selectedPeriod == null || activeFlags.length === 0 || !employeeId
          }
          onClick={() => setFormOpen(true)}
        >
          Submit Explanation
        </Button>
      </div>

      {employeeId && selectedPeriod ? (
        <FieldMovementForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSuccess={() => {
            void currentFlags.refetch();
            void previousFlags.refetch();
          }}
          employeeId={employeeId}
          month={selectedPeriod.month}
          year={selectedPeriod.year}
          flaggedDays={activeFlags}
        />
      ) : null}
    </div>
  );
}
