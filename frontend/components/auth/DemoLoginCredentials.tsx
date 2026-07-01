'use client';

import { useState } from 'react';
import { Button } from 'antd';
import Card from '@/components/ui/Card/Card';
import {
  DEMO_LOGIN_ACCOUNTS,
  DEMO_PASSWORD,
  type DemoLoginAccount,
} from '@/lib/constants/demo-login-credentials';

interface DemoLoginCredentialsProps {
  onSelectAccount: (email: string, password: string) => void;
}

export function DemoLoginCredentials({
  onSelectAccount,
}: DemoLoginCredentialsProps): React.ReactNode {
  const [expanded, setExpanded] = useState(true);

  function handleSelect(account: DemoLoginAccount): void {
    onSelectAccount(account.email, DEMO_PASSWORD);
  }

  return (
    <Card
      className="w-full shadow-sm lg:max-w-md"
      styles={{ body: { padding: 20 } }}
      style={{ borderRadius: 6 }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Demo accounts</h2>
          <p className="mt-1 text-xs text-slate-500">
            Password for every account:{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-800">
              {DEMO_PASSWORD}
            </code>
          </p>
        </div>
        <Button
          type="link"
          size="small"
          className="!px-0 !text-xs"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </Button>
      </div>

      {expanded && (
        <div className="max-h-[min(70vh,520px)] space-y-1 overflow-y-auto pr-1">
          {DEMO_LOGIN_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => handleSelect(account)}
              className="flex w-full flex-col rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-left transition hover:border-orange-200 hover:bg-orange-50"
            >
              <span className="text-xs font-medium text-slate-900">{account.role}</span>
              <span className="text-[11px] text-slate-600">{account.name}</span>
              <span className="truncate font-mono text-[11px] text-slate-500">{account.email}</span>
              {account.highlight && (
                <span className="mt-1 text-[10px] text-orange-700">{account.highlight}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
