import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeeProfileDocuments from './EmployeeProfileDocuments';

const mockUpload = vi.fn();
const mockSuccess = vi.fn();

vi.mock('@/lib/query/users', () => ({
  useUserDocuments: () => ({ data: [], isLoading: false }),
  useUploadUserDocuments: () => ({ mutateAsync: mockUpload, isPending: false }),
  useDeleteUserDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/query/profile', () => ({
  useMyProfileDocuments: () => ({ data: [], isLoading: false }),
  myProfileDocumentDownloadPath: (id: string) => `/auth/me/documents/${id}/download-url`,
}));

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

vi.mock('@/hooks/use-app-message', () => ({
  useAppMessage: () => ({ success: mockSuccess, error: vi.fn(), warning: vi.fn() }),
}));

describe('EmployeeProfileDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue([]);
  });

  it('uploads every selected file straight away, with no separate upload step', async () => {
    const user = userEvent.setup();
    const { container } = render(<EmployeeProfileDocuments userId="user-1" embedded />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');

    await user.upload(input, [
      new File(['a'], 'passport.pdf', { type: 'application/pdf' }),
      new File(['b'], 'degree.jpg', { type: 'image/jpeg' }),
    ]);

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    const call = mockUpload.mock.calls[0][0] as {
      userId: string;
      files: File[];
      labels: string[];
    };
    expect(call.userId).toBe('user-1');
    expect(call.files.map((file) => file.name)).toEqual(['passport.pdf', 'degree.jpg']);
    expect(call.labels).toEqual(['passport', 'degree']);
    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith('users.documentsUploaded'));

    // Only the picker button exists - no second "upload" step.
    expect(
      screen.getAllByRole('button', { name: /users\.form\.uploadDocuments/ }),
    ).toHaveLength(1);
  });

  it('hides the upload control when read-only', () => {
    const { container } = render(
      <EmployeeProfileDocuments userId="user-1" embedded readOnly source="self" />,
    );
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});
