import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api/errors';
import EmployeeLoginNameField from './EmployeeLoginNameField';

const mockUpdateLoginName = vi.fn();
const mockSetToFullName = vi.fn();
const mockMessage = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };

vi.mock('@/lib/query/users', () => ({
  useUpdateLoginName: () => ({ mutateAsync: mockUpdateLoginName, isPending: false }),
  useSetLoginNameToFullName: () => ({ mutateAsync: mockSetToFullName, isPending: false }),
}));

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

vi.mock('@/hooks/use-app-message', () => ({
  useAppMessage: () => mockMessage,
}));

/** Backend ConflictException text (user-management.service LOGIN_NAME_CONFLICT). */
const LOGIN_NAME_CONFLICT = 'Another user already has this login name';

const BASE_PROPS = {
  userId: 'user-1',
  firstName: 'Abebe',
  middleName: null,
  lastName: 'Kebede',
};

describe('EmployeeLoginNameField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateLoginName.mockResolvedValue({});
    mockSetToFullName.mockResolvedValue({});
  });

  it('shows the login name read-only without HR/admin rights', () => {
    render(
      <EmployeeLoginNameField {...BASE_PROPS} loginName="abebe.k" canEdit={false} />,
    );

    expect(screen.getByText('abebe.k')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /common\.edit/ })).not.toBeInTheDocument();
    // Differs from the full name, but the fix-it prompt is HR-only too.
    expect(screen.queryByText('users.loginNameDiffersWarning')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers no "set to full name" action without HR/admin rights when unset', () => {
    render(
      <EmployeeLoginNameField {...BASE_PROPS} loginName={null} canEdit={false} />,
    );

    expect(screen.getByText('users.loginNameNotSet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lets HR/admin edit the login name and saves the trimmed value', async () => {
    const user = userEvent.setup();
    render(<EmployeeLoginNameField {...BASE_PROPS} loginName="abebe.k" canEdit />);

    await user.click(screen.getByRole('button', { name: /common\.edit/ }));
    const input = await screen.findByLabelText('users.loginName');
    expect(input).toHaveValue('abebe.k');

    await user.clear(input);
    await user.type(input, '  Abebe Kebede  ');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(mockUpdateLoginName).toHaveBeenCalledWith({
        userId: 'user-1',
        loginName: 'Abebe Kebede',
      }),
    );
    expect(mockMessage.success).toHaveBeenCalledWith('users.loginNameUpdated');
  });

  it('shows HR/admin the "set to full name" action when the login name is unset', async () => {
    const user = userEvent.setup();
    render(<EmployeeLoginNameField {...BASE_PROPS} loginName="" canEdit />);

    await user.click(
      screen.getByRole('button', { name: 'users.loginNameSetToFullName' }),
    );

    await waitFor(() => expect(mockSetToFullName).toHaveBeenCalledWith('user-1'));
  });

  it('displays the uniqueness error and keeps the dialog open', async () => {
    mockUpdateLoginName.mockRejectedValue(
      new ApiRequestError(LOGIN_NAME_CONFLICT, 'CONFLICT', 409),
    );
    const user = userEvent.setup();
    render(<EmployeeLoginNameField {...BASE_PROPS} loginName="abebe.k" canEdit />);

    await user.click(screen.getByRole('button', { name: /common\.edit/ }));
    const input = await screen.findByLabelText('users.loginName');
    await user.clear(input);
    await user.type(input, 'taken.name');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(mockMessage.error).toHaveBeenCalledWith(LOGIN_NAME_CONFLICT),
    );
    expect(mockMessage.success).not.toHaveBeenCalled();
    // Still open with the rejected value, so HR can pick another name.
    expect(screen.getByLabelText('users.loginName')).toHaveValue('taken.name');
  });
});
