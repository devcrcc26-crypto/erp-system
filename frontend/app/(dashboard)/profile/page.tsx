import { Suspense } from 'react';
import { Spin } from 'antd';
import ProfilePageContent from '@/components/modules/profile/ProfilePageContent';

export default function ProfilePage(): React.ReactNode {
  return (
    <Suspense
      fallback={
        <div className="erp-pro-list-page erp-users-page erp-profile-page">
          <div className="erp-pro-card flex justify-center p-12">
            <Spin />
          </div>
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}
