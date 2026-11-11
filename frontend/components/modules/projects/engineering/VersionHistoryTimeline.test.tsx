import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { VersionHistoryEntry } from '@/lib/api/epc.types';
import VersionHistoryTimeline from '@/components/modules/projects/engineering/VersionHistoryTimeline';

const mockHistory: VersionHistoryEntry[] = [
  {
    engineeringDocumentVersionId: 'edv-1',
    revisionLabel: 'A',
    status: 'APPROVED',
    createdAt: '2026-03-01T10:00:00.000Z',
    loop: 'INTERNAL',
    events: [
      {
        action: 'SUBMIT_FOR_REVIEW',
        phase: 'COMMITTED',
        createdAt: '2026-03-01T09:00:00.000Z',
      },
    ],
  },
  {
    engineeringDocumentVersionId: 'edv-2',
    revisionLabel: 'B',
    status: 'IN_REVIEW',
    createdAt: '2026-03-10T10:00:00.000Z',
    loop: 'EXTERNAL',
    events: [
      {
        action: 'UPLOAD',
        phase: 'INTENT',
        createdAt: '2026-03-10T09:00:00.000Z',
      },
    ],
  },
];

const useEngineeringDocumentVersionHistory = vi.fn();

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({
    locale: 'en' as const,
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/query/epc-workspace', () => ({
  useEngineeringDocumentVersionHistory: (...args: unknown[]) =>
    useEngineeringDocumentVersionHistory(...args),
}));

describe('VersionHistoryTimeline', () => {
  beforeEach(() => {
    useEngineeringDocumentVersionHistory.mockReturnValue({
      isLoading: false,
      data: mockHistory,
    });
  });

  it('renders revision blocks from the version history query', () => {
    render(<VersionHistoryTimeline engineeringDocumentId="doc-1" />);
    expect(screen.getByText('Rev A')).toBeInTheDocument();
    expect(screen.getByText('Rev B')).toBeInTheDocument();
    expect(screen.getByText('SUBMIT_FOR_REVIEW')).toBeInTheDocument();
  });

  it('filters entries by workflow loop', async () => {
    const user = userEvent.setup();
    render(<VersionHistoryTimeline engineeringDocumentId="doc-1" />);

    await user.click(screen.getByText('External'));

    expect(screen.queryByText('Rev A')).not.toBeInTheDocument();
    expect(screen.getByText('Rev B')).toBeInTheDocument();
  });

  it('shows loading spinner while history is fetching', () => {
    useEngineeringDocumentVersionHistory.mockReturnValue({
      isLoading: true,
      data: undefined,
    });

    const { container } = render(
      <VersionHistoryTimeline engineeringDocumentId="doc-1" />,
    );
    expect(container.querySelector('.ant-spin')).toBeTruthy();
  });
});
