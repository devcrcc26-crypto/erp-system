import { Suspense } from 'react';
import ProfilePageContent from '@/components/modules/profile/ProfilePageContent';

export default function ProfilePage(): React.ReactNode {
  return (
    <Suspense fallback={null}>
      <ProfilePageContent />
    </Suspense>
  );
}
