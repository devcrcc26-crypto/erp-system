import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddEmployeeForm from './AddEmployeeForm';

const mockUseUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockCreateUser = vi.fn();

const idleMutation = (): { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean } => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
});

vi.mock('@/lib/query/users', () => ({
  useUser: (...args: unknown[]) => mockUseUser(...args),
  useCreateUser: () => ({ mutateAsync: mockCreateUser, isPending: false }),
  useUpdateUser: () => ({ mutateAsync: mockUpdateUser, isPending: false }),
  useAssignRole: () => idleMutation(),
  useRevokeRole: () => idleMutation(),
  useUploadUserDocuments: () => idleMutation(),
  useUploadUserPhoto: () => idleMutation(),
}));

vi.mock('@/lib/query/org', () => ({
  useDepartments: () => ({ data: { data: [] }, isLoading: false }),
  usePositions: () => ({ data: { data: [] }, isLoading: false }),
  useEngineeringDisciplineOptions: () => ({ options: [], isLoading: false }),
}));

vi.mock('@/lib/query/roles', () => ({
  useRoles: () => ({ data: { data: [] }, isLoading: false }),
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
  gender: 'FEMALE',
  dateOfBirth: '1990-05-21',
  nationalId: 'NID-1',
  nationality: 'CHINESE',
  employeeType: 'PERMANENT',
  educationLevel: 'BSC',
  fieldOfStudy: 'Civil Engineering',
  experienceStartDate: '2015-09-01',
  addressCountry: 'Ethiopia',
  addressCity: 'Addis Ababa',
  emergencyContacts: [{ firstName: 'Wei', lastName: 'Chen', phone: '+251900000000' }],
  isActive: true,
  userRoles: [],
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
      experienceStartDate: '2015-09-01',
      addressCountry: 'Ethiopia',
      addressCity: 'Addis Ababa',
    });
    expect(body.emergencyContacts).toHaveLength(1);
  });

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
  });
});

describe('AddEmployeeForm (create mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateUser.mockResolvedValue({ id: 'new-user' });
    mockUseUser.mockReturnValue({
      isLoading: false,
      isError: false,
      data: undefined,
      error: null,
    });
  });

  it('sends every typed profile field when creating an employee', async () => {
    const user = userEvent.setup();
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
  }, 20_000);
});
