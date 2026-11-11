import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AddEmployeePendingDocuments from './AddEmployeePendingDocuments';

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

describe('AddEmployeePendingDocuments', () => {
  it('keeps every file when several are selected at once', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <AddEmployeePendingDocuments value={[]} onChange={onChange} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');

    await user.upload(input, [
      new File(['a'], 'passport.pdf', { type: 'application/pdf' }),
      new File(['b'], 'degree.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'id-card.png', { type: 'image/png' }),
    ]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const added = onChange.mock.calls[0][0] as Array<{ label: string }>;
    expect(added.map((item) => item.label)).toEqual(['passport', 'degree', 'id-card']);
  });
});
