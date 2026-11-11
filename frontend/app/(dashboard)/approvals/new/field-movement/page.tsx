'use client';

import { useEffect } from 'react';
import { Spin } from 'antd';
import { useRouter } from 'next/navigation';

/**
 * Legacy path - dedicated form lives at /approvals/new/field-movement-log.
 */
export default function FieldMovementLegacyRedirectPage(): React.ReactNode {
  const router = useRouter();

  useEffect(() => {
    router.replace('/approvals/new/field-movement-log');
  }, [router]);

  return (
    <div className="flex justify-center p-12">
      <Spin />
    </div>
  );
}
