'use client';

import { useEffect, useRef, useState } from 'react';
import { signOutLocally } from '@/lib/auth/sign-out-locally';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Clears any existing session when starting account activation, password reset,
 * or similar identity-changing flows opened while another user is signed in.
 */
export function usePrepareIdentityAuthFlow(): { priorUserEmail: string | null } {
  const preparedRef = useRef(false);
  const [priorUserEmail, setPriorUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (preparedRef.current) {
      return;
    }

    preparedRef.current = true;

    const priorUser = useAuthStore.getState().user;
    if (priorUser?.email) {
      setPriorUserEmail(priorUser.email);
    }

    signOutLocally();
  }, []);

  return { priorUserEmail };
}
