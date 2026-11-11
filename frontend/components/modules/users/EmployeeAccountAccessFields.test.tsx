import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CAPABILITIES, type Capabilities } from '@/lib/api/types';
import { canResetUserPassword } from '@/lib/utils/user-permissions';
import { useAuthStore } from '@/stores/auth.store';
import EmployeeAccountAccessFields from './EmployeeAccountAccessFields';

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

const HR_VIEW_ONLY: Capabilities = {
  ...EMPTY_CAPABILITIES,
  canViewHr: true,
  canEditHr: true,
  canManageUsers: true,
};
const USERS_EDIT: Capabilities = { ...HR_VIEW_ONLY, canEditUsers: true };

type AccessUser = Parameters<typeof EmployeeAccountAccessFields>[0]['user'];

const USER: AccessUser = {
  loginName: 'abebe.k',
  excludedFromHrProcesses: false,
  excludedReason: null,
};

function renderFields(user: AccessUser = USER): void {
  render(<EmployeeAccountAccessFields user={user} />);
}

describe('EmployeeAccountAccessFields - detail page (read-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    useAuthStore.setState({ capabilities: { ...EMPTY_CAPABILITIES } });
  });

  it('shows login name and approver-only as read-only values', () => {
    renderFields({ ...USER, loginName: '' });

    expect(screen.getByText('users.loginNameNotSet')).toBeInTheDocument();
    expect(screen.getByText('common.no')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('shows the Approver only tag and reason when excluded', () => {
    renderFields({
      ...USER,
      excludedFromHrProcesses: true,
      excludedReason: 'Board member',
    });

    expect(screen.getByText('users.approverOnly')).toBeInTheDocument();
    expect(screen.getByText('Board member')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('shows the set login name when present', () => {
    renderFields(USER);
    expect(screen.getByText('abebe.k')).toBeInTheDocument();
  });
});

describe('HR "Reset password" (POST /users/:id/reset-password requires users.edit)', () => {
  it('is hidden for hr.view without users.edit', () => {
    expect(canResetUserPassword({ isActive: true }, HR_VIEW_ONLY.canEditUsers)).toBe(false);
  });

  it('is shown with users.edit for active accounts only', () => {
    expect(canResetUserPassword({ isActive: true }, USERS_EDIT.canEditUsers)).toBe(true);
    expect(canResetUserPassword({ isActive: false }, USERS_EDIT.canEditUsers)).toBe(false);
  });
});
