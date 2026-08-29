'use client';

import { useState } from 'react';
import { Button } from 'antd';
import {
  DEMO_LOGIN_ACCOUNTS,
  DEMO_PASSWORD,
  type DemoLoginAccount,
} from '@/lib/constants/demo-login-credentials';
import { tokens } from '@/lib/theme/tokens';

interface DemoLoginCredentialsProps {
  onSelectAccount: (email: string, password: string) => void;
}

/**
 * Compact demo-account picker for local / staging enterprise login.
 */
export function DemoLoginCredentials({
  onSelectAccount,
}: DemoLoginCredentialsProps): React.ReactNode {
  const [expanded, setExpanded] = useState(false);

  function handleSelect(account: DemoLoginAccount): void {
    onSelectAccount(account.email, DEMO_PASSWORD);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-xs font-medium text-slate-600">Demo access</p>
          <p className="m-0 mt-0.5 text-[11px] text-slate-400">
            Shared password{' '}
            <code className="rounded-sm bg-slate-100 px-1 py-0.5 font-mono text-slate-600">
              {DEMO_PASSWORD}
            </code>
          </p>
        </div>
        <Button
          type="link"
          size="small"
          className="!shrink-0 !px-0 !text-xs"
          style={{ color: tokens.colorPrimary }}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide accounts' : 'Show accounts'}
        </Button>
      </div>

      {expanded ? (
        <div className="mt-3 max-h-[min(40vh,280px)] space-y-1 overflow-y-auto overscroll-contain pr-1">
          {DEMO_LOGIN_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => handleSelect(account)}
              className="erp-login-demo-account flex w-full min-w-0 flex-col border px-3 py-2 text-left transition"
              style={{ borderRadius: 0 }}
            >
              <span className="text-xs font-medium text-slate-900">
                {account.role}
              </span>
              <span className="text-[11px] text-slate-600">{account.name}</span>
              <span className="truncate font-mono text-[11px] text-slate-500">
                {account.email}
              </span>
              {account.highlight ? (
                <span
                  className="mt-1 text-[10px]"
                  style={{ color: tokens.colorPrimaryHover }}
                >
                  {account.highlight}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
