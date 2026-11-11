'use client';

import {
  DEMO_LOGIN_ACCOUNTS,
  demoAccountPassword,
  type DemoLoginAccount,
} from '@/lib/constants/demo-login-credentials';
import { tokens } from '@/lib/theme/tokens';

interface DemoLoginCredentialsProps {
  onSelectAccount: (email: string, password: string) => void;
}

/**
 * Demo-account picker for local / staging login.
 * Loaded only via DemoLoginPanel when NODE_ENV !== 'production' and
 * NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true' - do not import from production routes.
 */
export function DemoLoginCredentials({
  onSelectAccount,
}: DemoLoginCredentialsProps): React.ReactNode {
  function handleSelect(account: DemoLoginAccount): void {
    onSelectAccount(account.email, demoAccountPassword(account));
  }

  return (
    <div className="erp-login-demo">
      <div className="min-w-0">
        <p className="m-0 text-xs font-semibold text-slate-700">Demo access</p>
        <p className="m-0 mt-0.5 text-[11px] text-slate-400">
          Click an account to fill email and password
        </p>
      </div>

      <div className="erp-login-demo-list mt-3 space-y-1.5">
        {DEMO_LOGIN_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => handleSelect(account)}
            className="erp-login-demo-account flex w-full min-w-0 flex-col px-3 py-2.5 text-left transition"
          >
            <span className="text-xs font-semibold text-slate-900">
              {account.role}
            </span>
            <span className="text-[11px] text-slate-600">{account.name}</span>
            <span className="truncate font-mono text-[11px] text-slate-500">
              {account.email}
            </span>
            {account.highlight ? (
              <span
                className="mt-1 text-[10px] font-medium"
                style={{ color: tokens.colorPrimaryHover }}
              >
                {account.highlight}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
