'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api/client';

interface HealthResponse {
  status: string;
  database: string;
  databaseHost?: string;
  emailDisabled?: boolean;
  autoApproveAll?: boolean;
}

/**
 * True when the API reports a non-Supabase database host.
 */
function isTestDatabaseHost(host: string | undefined): boolean {
  if (!host || host === 'unknown') {
    return false;
  }
  const normalised = host.toLowerCase();
  return !normalised.includes('supabase');
}

/**
 * Shell header status from /health: TEST DATABASE for a non-Supabase host,
 * Emails off when EMAIL_DISABLED, and AUTO-APPROVE ON when local auto-approve is active.
 */
export default function TestDatabaseBadge(): React.ReactNode {
  const [showTestDatabase, setShowTestDatabase] = useState(false);
  const [emailsOff, setEmailsOff] = useState(false);
  const [autoApproveOn, setAutoApproveOn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const health = await apiGet<HealthResponse>('/health');
        if (cancelled) {
          return;
        }
        if (isTestDatabaseHost(health.databaseHost)) {
          setShowTestDatabase(true);
        }
        if (health.emailDisabled === true) {
          setEmailsOff(true);
        }
        if (health.autoApproveAll === true) {
          setAutoApproveOn(true);
        }
      } catch {
        // Health probe failure must not break the shell.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!showTestDatabase && !emailsOff && !autoApproveOn) {
    return null;
  }

  return (
    <>
      {showTestDatabase ? (
        <span
          className="erp-test-db-badge"
          title="Connected to a non-production / non-Supabase database"
          role="status"
        >
          TEST DATABASE
        </span>
      ) : null}
      {autoApproveOn ? (
        <span
          className="erp-auto-approve-badge"
          title="All approval requests are approved automatically (local test mode)"
          role="status"
        >
          AUTO-APPROVE ON
        </span>
      ) : null}
      {emailsOff ? (
        <span
          className="erp-emails-off-badge"
          title="Outbound email is disabled"
          role="status"
        >
          Emails off
        </span>
      ) : null}
    </>
  );
}
