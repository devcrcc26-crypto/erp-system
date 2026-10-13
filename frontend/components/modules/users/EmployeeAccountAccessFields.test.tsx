import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api/errors';
import { EMPTY_CAPABILITIES, type Capabilities } from '@/lib/api/types';
import { canResetUserPassword } from '@/lib/utils/user-permissions';
import { useAuthStore } from '@/stores/auth.store';
import EmployeeAccountAccessFields from './EmployeeAccountAccessFields';

// The reason TextArea observes its size; jsdom has no ResizeObserver.
beforeAll(() => {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

const mockUpdateUser = vi.fn();
const mockMessage = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };

vi.mock('@/lib/query/users', () => ({
  useUpdateUser: () => ({ mutateAsync: mockUpdateUser, isPending: false }),
  useUpdateLoginName: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetLoginNameToFullName: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

vi.mock('@/hooks/use-app-message', () => ({
  useAppMessage: () => mockMessage,
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
  id: 'user-1',
  loginName: 'abebe.k',
  firstName: 'Abebe',
  middleName: null,
  lastName: 'Kebede',
  excludedFromHrProcesses: false,
  excludedReason: null,
};

function renderAs(capabilities: Capabilities, user: AccessUser = USER): void {
  useAuthStore.setState({ capabilities, capabilitiesReady: true });
  render(<EmployeeAccountAccessFields user={user} />);
}

describe('EmployeeAccountAccessFields — users.edit vs hr.view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUser.mockResolvedValue({});
  });

  afterEach(() => {
    useAuthStore.setState({ capabilities: { ...EMPTY_CAPABILITIES } });
  });

  it('hr.view without users.edit: login name and approver-only are read-only', () => {
    renderAs(HR_VIEW_ONLY, { ...USER, loginName: '' });

    expect(screen.getByText('users.loginNameNotSet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /common\.edit/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'users.loginNameSetToFullName' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('common.no')).toBeInTheDocument();
  });

  it('hr.view without users.edit sees the "Approver only" tag, not a switch', () => {
    renderAs(HR_VIEW_ONLY, {
      ...USER,
      excludedFromHrProcesses: true,
      excludedReason: 'Board member',
    });

    expect(screen.getByText('users.approverOnly')).toBeInTheDocument();
    expect(screen.getByText('Board member')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('users.edit: login name Edit / "Set to full name" and the approver-only switch', () => {
    renderAs(USERS_EDIT, { ...USER, loginName: '' });

    expect(screen.getByRole('button', { name: /common\.edit/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'users.loginNameSetToFullName' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'users.approverOnlySwitch' })).not.toBeChecked();
  });

  it('users.edit: turning the switch on saves the flag with a reason', async () => {
    const user = userEvent.setup();
    renderAs(USERS_EDIT);

    await user.click(screen.getByRole('switch', { name: 'users.approverOnlySwitch' }));
    expect(await screen.findByText('users.approverOnlyEnableTitle')).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText('users.approverOnlyReasonPlaceholder'),
      '  External director ',
    );
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({
        userId: 'user-1',
        body: { excludedFromHrProcesses: true, excludedReason: 'External director' },
      }),
    );
    expect(mockMessage.success).toHaveBeenCalledWith('users.approverOnlyUpdated');
  });

  it('users.edit: turning it off includes the employee again and clears the reason', async () => {
    const user = userEvent.setup();
    renderAs(USERS_EDIT, { ...USER, excludedFromHrProcesses: true, excludedReason: 'x' });

    await user.click(screen.getByRole('switch', { name: 'users.approverOnlySwitch' }));
    expect(await screen.findByText('users.approverOnlyDisableTitle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({
        userId: 'user-1',
        body: { excludedFromHrProcesses: false, excludedReason: null },
      }),
    );
  });

  it('shows the API error (e.g. 403 without users.edit) and keeps the dialog open', async () => {
    mockUpdateUser.mockRejectedValue(new ApiRequestError('Forbidden', 'FORBIDDEN', 403));
    const user = userEvent.setup();
    renderAs(USERS_EDIT);

    await user.click(screen.getByRole('switch', { name: 'users.approverOnlySwitch' }));
    await user.click(await screen.findByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(mockMessage.error).toHaveBeenCalledWith('Forbidden'));
    expect(screen.getByText('users.approverOnlyEnableTitle')).toBeInTheDocument();
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
