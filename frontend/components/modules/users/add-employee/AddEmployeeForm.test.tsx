import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CAPABILITIES } from '@/lib/api/types';
import { useAuthStore } from '@/stores/auth.store';
import AddEmployeeForm from './AddEmployeeForm';

// The DatePicker popup observes its size; jsdom has no ResizeObserver.
beforeAll(() => {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

const mockUseUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockCreateUser = vi.fn();
const mockAssignRole = vi.fn();

const idleMutation = (): { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean } => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
});

vi.mock('@/lib/query/users', () => ({
  useUser: (...args: unknown[]) => mockUseUser(...args),
  useCreateUser: () => ({ mutateAsync: mockCreateUser, isPending: false }),
  useUpdateUser: () => ({ mutateAsync: mockUpdateUser, isPending: false }),
  useAssignRole: () => ({ mutateAsync: mockAssignRole, isPending: false }),
  useRevokeRole: () => idleMutation(),
  useSetPrimaryRole: () => idleMutation(),
  useUploadUserDocuments: () => idleMutation(),
  useUploadUserPhoto: () => idleMutation(),
}));

vi.mock('@/lib/query/org', () => ({
  useDepartments: () => ({ data: { data: [] }, isLoading: false }),
  usePositions: () => ({ data: { data: [] }, isLoading: false }),
  useSeniorityLevels: () => ({ data: [], isLoading: false }),
  useEngineeringDisciplineOptions: () => ({ options: [], isLoading: false }),
}));

const EMPLOYEE_ROLE = { id: 'role-employee', name: 'Employee', isActive: true };

vi.mock('@/lib/query/roles', () => ({
  useRoles: () => ({ data: { data: [EMPLOYEE_ROLE] }, isLoading: false }),
}));

vi.mock('@/lib/query/leave-policy', () => ({
  useLeavePolicies: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/query/work-schedule', () => ({
  useWorkScheduleList: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

vi.mock('@/hooks/use-app-message', () => ({
  useAppMessage: () => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));

vi.mock('@/components/ui/UserSelect/UserSelect', () => ({
  default: ({ value }: { value?: string }) => (
    <div data-testid="reports-to">{value ?? ''}</div>
  ),
}));

vi.mock('@/components/modules/users/EmployeeProfileDocuments', () => ({
  default: () => <div data-testid="documents" />,
}));

vi.mock('@/components/modules/users/EmployeeProfilePhoto', () => ({
  default: () => <div data-testid="photo" />,
}));

vi.mock('@/components/modules/users/add-employee/AddEmployeeReviewStep', () => ({
  default: () => <div data-testid="review" />,
}));

const USER = {
  id: 'user-1',
  companyId: 'company-1',
  branchId: null,
  departmentId: 'dept-1',
  positionId: 'pos-1',
  reportsToUserId: 'boss-1',
  engineeringDisciplineId: null,
  firstName: 'Jinxia',
  lastName: 'Dong',
  middleName: 'M',
  chineseName: '董锦霞',
  email: 'jinxia.dong@ccecc.com',
  phone: '+251911000000',
  loginName: 'Jinxia M Dong',
  gender: 'FEMALE',
  dateOfBirth: '1990-05-21',
  nationalId: 'NID-1',
  nationality: 'CHINESE',
  employeeType: 'PERMANENT',
  educationLevel: 'BSC',
  fieldOfStudy: 'Civil Engineering',
  yearsOfExperience: 6.5,
  yearsOfExperienceAsOf: '2026-01-15',
  employmentDate: '2020-03-01',
  addressCountry: 'Ethiopia',
  addressCity: 'Addis Ababa',
  emergencyContacts: [{ firstName: 'Wei', lastName: 'Chen', phone: '+251900000000' }],
  isActive: true,
  excludedFromHrProcesses: false,
  excludedReason: null,
  // Roles are required (exactly one primary) since multi-role assignment.
  userRoles: [{ roleId: 'role-employee', isPrimary: true, role: { name: 'Employee' } }],
};

function renderEditForm(): void {
  render(
    <StrictMode>
      <AddEmployeeForm userId="user-1" onSuccess={vi.fn()} />
    </StrictMode>,
  );
}

function inputFor(label: string): HTMLElement {
  // Form.Item labels render the i18n key (t is identity in these tests).
  return screen.getByLabelText(label);
}

async function clickThroughAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  submitLabel: string,
): Promise<void> {
  for (let step = 0; step < 5; step += 1) {
    await user.click(await screen.findByRole('button', { name: 'hr.buttons.next' }));
  }
  await user.click(await screen.findByRole('button', { name: submitLabel }));
}

describe('AddEmployeeForm (edit mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUser.mockResolvedValue({});
    mockUseUser.mockReturnValue({
      isLoading: false,
      isError: false,
      data: USER,
      error: null,
    });
  });

  it('prefills the saved employee, including the read-only email', async () => {
    renderEditForm();

    const email = screen.getByPlaceholderText('users.form.emailPlaceholder');
    await waitFor(() => expect(email).toHaveValue('jinxia.dong@ccecc.com'));
    expect(email).toBeDisabled();
    expect(screen.getByDisplayValue('Jinxia')).toBeInTheDocument();
    expect(screen.getByDisplayValue('董锦霞')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Addis Ababa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('NID-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Civil Engineering')).toBeInTheDocument();
    expect(screen.getByTestId('reports-to')).toHaveTextContent('boss-1');
  });

  it('saves every prefilled field back unchanged when nothing is edited', async () => {
    const user = userEvent.setup();
    renderEditForm();
    await waitFor(() =>
      expect(screen.getByDisplayValue('Jinxia')).toBeInTheDocument(),
    );

    // Buttons read "loading …" while a step validates, so wait for each one.
    for (let step = 0; step < 5; step += 1) {
      await user.click(
        await screen.findByRole('button', { name: 'hr.buttons.next' }),
      );
    }
    await user.click(
      await screen.findByRole('button', { name: 'common.saveChanges' }),
    );

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    const { body } = mockUpdateUser.mock.calls[0][0] as {
      body: Record<string, unknown>;
    };
    expect(body).toMatchObject({
      firstName: 'Jinxia',
      lastName: 'Dong',
      chineseName: '董锦霞',
      middleName: 'M',
      departmentId: 'dept-1',
      positionId: 'pos-1',
      reportsToUserId: 'boss-1',
      gender: 'FEMALE',
      dateOfBirth: '1990-05-21',
      nationalId: 'NID-1',
      nationality: 'CHINESE',
      employeeType: 'PERMANENT',
      educationLevel: 'BSC',
      fieldOfStudy: 'Civil Engineering',
      yearsOfExperience: 6.5,
      secondaryPhone: '',
      seniorityLevelId: null,
      employmentDate: '2020-03-01',
      addressCountry: 'Ethiopia',
      addressCity: 'Addis Ababa',
    });
    expect(body.emergencyContacts).toHaveLength(1);
    // Role unchanged, so no role API calls.
    expect(mockAssignRole).not.toHaveBeenCalled();
  }, 20_000);

  it('saves a changed employment date', async () => {
    const user = userEvent.setup();
    renderEditForm();
    const picker = inputFor('users.form.employmentDate');
    await waitFor(() => expect(picker).toHaveValue('2020-03-01'));

    await user.click(picker);
    await user.clear(picker);
    await user.type(picker, '2024-03-15{Enter}');
    await waitFor(() => expect(picker).toHaveValue('2024-03-15'));
    await clickThroughAndSubmit(user, 'common.saveChanges');

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    const { body } = mockUpdateUser.mock.calls[0][0] as {
      body: Record<string, unknown>;
    };
    expect(body.employmentDate).toBe('2024-03-15');
  }, 20_000);

  it('sends values typed during an edit', async () => {
    const user = userEvent.setup();
    renderEditForm();
    await waitFor(() =>
      expect(screen.getByDisplayValue('Addis Ababa')).toBeInTheDocument(),
    );

    await user.clear(inputFor('users.form.addressCity'));
    await user.type(inputFor('users.form.addressCity'), 'Adama');
    await user.type(inputFor('users.form.addressWoreda'), '05');
    await clickThroughAndSubmit(user, 'common.saveChanges');

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    const { body } = mockUpdateUser.mock.calls[0][0] as {
      body: Record<string, unknown>;
    };
    expect(body).toMatchObject({ addressCity: 'Adama', addressWoreda: '05' });
  }, 20_000);

  it('sends an empty lastName when it is cleared', async () => {
    const user = userEvent.setup();
    renderEditForm();
    const lastName = inputFor('users.form.lastName');
    await waitFor(() => expect(lastName).toHaveValue('Dong'));

    await user.clear(lastName);
    await clickThroughAndSubmit(user, 'common.saveChanges');

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    const { body } = mockUpdateUser.mock.calls[0][0] as {
      body: Record<string, unknown>;
    };
    expect(body).toMatchObject({ firstName: 'Jinxia', middleName: 'M', lastName: '' });
  }, 20_000);

  it('saves an employee whose lastName is already empty', async () => {
    mockUseUser.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...USER, lastName: '' },
      error: null,
    });
    const user = userEvent.setup();
    renderEditForm();
    await waitFor(() =>
      expect(screen.getByDisplayValue('Jinxia')).toBeInTheDocument(),
    );

    await clickThroughAndSubmit(user, 'common.saveChanges');

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    const { body } = mockUpdateUser.mock.calls[0][0] as {
      body: Record<string, unknown>;
    };
    expect(body.lastName).toBe('');
  }, 20_000);
});

describe('AddEmployeeForm - login name & approver-only (users.edit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUser.mockResolvedValue({});
    mockUseUser.mockReturnValue({ isLoading: false, isError: false, data: USER, error: null });
  });

  afterEach(() => {
    useAuthStore.setState({ capabilities: { ...EMPTY_CAPABILITIES } });
  });

  it('hides login name and approver-only without users.edit, and never sends them', async () => {
    useAuthStore.setState({
      capabilities: { ...EMPTY_CAPABILITIES, canViewHr: true, canEditHr: true },
    });
    const user = userEvent.setup();
    renderEditForm();
    await waitFor(() => expect(screen.getByDisplayValue('Jinxia')).toBeInTheDocument());

    expect(screen.queryByLabelText('users.loginName')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('users.approverOnlySwitch')).not.toBeInTheDocument();
    await clickThroughAndSubmit(user, 'common.saveChanges');

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    const { body } = mockUpdateUser.mock.calls[0][0] as { body: Record<string, unknown> };
    expect(body).not.toHaveProperty('loginName');
    expect(body).not.toHaveProperty('excludedFromHrProcesses');
    expect(body).not.toHaveProperty('excludedReason');
  }, 20_000);

  it('users.edit can set login name and mark approver-only with a reason', async () => {
    useAuthStore.setState({
      capabilities: { ...EMPTY_CAPABILITIES, canViewHr: true, canEditUsers: true },
    });
    const user = userEvent.setup({ delay: null });
    renderEditForm();
    const loginInput = await screen.findByLabelText('users.loginName');
    expect(loginInput).toHaveValue('Jinxia M Dong');
    await user.clear(loginInput);
    await user.type(loginInput, 'Jinxia Dong');

    const toggle = await screen.findByLabelText('users.approverOnlySwitch');
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await user.type(
      await screen.findByLabelText('users.approverOnlyReason'),
      'External director',
    );
    await clickThroughAndSubmit(user, 'common.saveChanges');

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    const { body } = mockUpdateUser.mock.calls[0][0] as { body: Record<string, unknown> };
    expect(body).toMatchObject({
      loginName: 'Jinxia Dong',
      excludedFromHrProcesses: true,
      excludedReason: 'External director',
    });
  }, 45_000);
});

describe('AddEmployeeForm (create mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateUser.mockResolvedValue({ id: 'new-user' });
    mockAssignRole.mockResolvedValue({});
    mockUseUser.mockReturnValue({
      isLoading: false,
      isError: false,
      data: undefined,
      error: null,
    });
  });

  it('sends every typed profile field when creating an employee', async () => {
    // Lots of typing: skip userEvent's per-keystroke delay so it fits the timeout under load.
    const user = userEvent.setup({ delay: null });
    render(
      <StrictMode>
        <AddEmployeeForm onSuccess={vi.fn()} />
      </StrictMode>,
    );

    await user.type(inputFor('users.form.firstName'), 'Abebe');
    await user.type(inputFor('users.form.lastName'), 'Kebede');
    await user.type(inputFor('users.form.middleName'), 'Tesfaye');
    await user.type(inputFor('users.form.chineseName'), '阿贝贝');
    await user.type(
      screen.getByPlaceholderText('users.form.emailPlaceholder'),
      'abebe@ccecc.com',
    );
    await user.type(inputFor('users.form.phone'), '+251911111111');
    await user.type(inputFor('users.form.nationalId'), 'NID-9');
    await user.type(inputFor('users.form.addressCity'), 'Addis Ababa');
    await user.type(inputFor('users.form.fieldOfStudy'), 'Surveying');
    // Roles are required: the first added role becomes primary.
    await user.click(screen.getByRole('button', { name: /users\.addAnotherRole/ }));
    await clickThroughAndSubmit(user, 'users.sendInvitation');

    await waitFor(() => expect(mockCreateUser).toHaveBeenCalledTimes(1));
    const body = mockCreateUser.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      firstName: 'Abebe',
      lastName: 'Kebede',
      middleName: 'Tesfaye',
      chineseName: '阿贝贝',
      email: 'abebe@ccecc.com',
      phone: '+251911111111',
      nationalId: 'NID-9',
      addressCity: 'Addis Ababa',
      fieldOfStudy: 'Surveying',
    });
    await waitFor(() =>
      expect(mockAssignRole).toHaveBeenCalledWith({
        userId: 'new-user',
        roleId: 'role-employee',
        isPrimary: true,
      }),
    );
  }, 20_000);

  it('saves the employment date entered for a new employee', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <StrictMode>
        <AddEmployeeForm onSuccess={vi.fn()} />
      </StrictMode>,
    );

    await user.type(inputFor('users.form.firstName'), 'Abebe');
    await user.click(screen.getByRole('button', { name: /users\.addAnotherRole/ }));
    const picker = inputFor('users.form.employmentDate');
    await user.click(picker);
    await user.type(picker, '2023-07-10{Enter}');
    await waitFor(() => expect(picker).toHaveValue('2023-07-10'));
    // No email → record-only account ("Create user" instead of "Send invitation").
    await clickThroughAndSubmit(user, 'users.createUser');

    await waitFor(() => expect(mockCreateUser).toHaveBeenCalledTimes(1));
    const body = mockCreateUser.mock.calls[0][0] as Record<string, unknown>;
    expect(body.employmentDate).toBe('2023-07-10');
  }, 20_000);
});
