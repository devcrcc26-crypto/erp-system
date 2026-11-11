import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({
    locale: 'en' as const,
    t: (key: string) => {
      const labels: Record<string, string> = {
        'edvStatus.DRAFT': 'Draft',
        'edvStatus.IN_REVIEW': 'In Review',
        'edvStatus.APPROVED': 'Approved',
        'edvStatus.LOCKED': 'Locked',
        'edvStatus.SUPERSEDED': 'Superseded',
      };
      return labels[key] ?? key;
    },
  }),
}));

describe('EdvStatusBadge', () => {
  it('renders translated label for each EDV status', () => {
    render(<EdvStatusBadge status="APPROVED" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders in-review status with info styling', () => {
    const { container } = render(<EdvStatusBadge status="IN_REVIEW" />);
    expect(screen.getByText('In Review')).toBeInTheDocument();
    expect(container.querySelector('.ant-tag')).toBeTruthy();
  });

  it('falls back to key segment for unknown status', () => {
    render(<EdvStatusBadge status="UNKNOWN" />);
    expect(screen.getByText('edvStatus.UNKNOWN')).toBeInTheDocument();
  });
});
