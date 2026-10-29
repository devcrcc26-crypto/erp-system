'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLogout } from '@/lib/query/auth';
import { signOutLocally } from '@/lib/auth/sign-out-locally';

export default function LogoutPage(): React.ReactNode {
  const router = useRouter();
  const logout = useLogout();

  useEffect(() => {
    async function performLogout(): Promise<void> {
      try {
        await logout.mutateAsync();
      } catch {
        // ignore
      } finally {
        signOutLocally();
        router.replace('/login');
      }
    }

    void performLogout();
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center py-24 text-center text-sm text-slate-500">
      Signing out…
    </div>
  );
}
