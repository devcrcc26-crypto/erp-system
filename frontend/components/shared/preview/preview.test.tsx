import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentPreview from './DocumentPreview';
import DocumentPreviewGroup from './DocumentPreviewGroup';
import { resolvePreviewKind } from './preview-context';
import { useSignedUrl } from './useSignedUrl';

const mockApiGet = vi.fn();
const mockError = vi.fn();

// jsdom has no ResizeObserver; the Ant Design modal observes its content.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

vi.mock('@/lib/api/client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars?.name ? `${key}:${vars.name}` : key,
    locale: 'en',
  }),
}));

vi.mock('@/hooks/use-app-message', () => ({
  useAppMessage: () => ({ success: vi.fn(), error: mockError, warning: vi.fn() }),
}));

describe('resolvePreviewKind', () => {
  it('previews browser-renderable images and PDFs only', () => {
    expect(resolvePreviewKind('image/jpeg', 'a.jpg')).toBe('image');
    expect(resolvePreviewKind('image/png', 'a.png')).toBe('image');
    expect(resolvePreviewKind('image/webp', 'a.webp')).toBe('image');
    expect(resolvePreviewKind('image/gif', 'a.gif')).toBe('image');
    expect(resolvePreviewKind('application/pdf', 'a.pdf')).toBe('pdf');
    expect(resolvePreviewKind('image/tiff', 'a.tiff')).toBe('none');
    expect(
      resolvePreviewKind(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'a.xlsx',
      ),
    ).toBe('none');
    expect(resolvePreviewKind('text/csv', 'a.csv')).toBe('none');
    expect(resolvePreviewKind('application/msword', 'a.doc')).toBe('none');
  });

  it('falls back to the extension only for missing or generic MIME types', () => {
    expect(resolvePreviewKind(undefined, 'scan.PDF')).toBe('pdf');
    expect(resolvePreviewKind('application/octet-stream', 'photo.jpeg')).toBe(
      'image',
    );
    expect(resolvePreviewKind(null, 'sheet.xlsx')).toBe('none');
    // A specific non-previewable MIME type wins over a misleading extension.
    expect(resolvePreviewKind('application/zip', 'archive.pdf')).toBe('none');
  });
});

describe('useSignedUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({ url: 'https://signed/1', expiresIn: 600 });
  });

  it('does not request anything until fetch() is called', () => {
    renderHook(() => useSignedUrl('doc-1'));
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('requests a 10-minute URL once and reuses it while fresh', async () => {
    const { result } = renderHook(() => useSignedUrl('doc-1'));

    let first: string | null = null;
    await act(async () => {
      first = await result.current.fetch();
    });
    expect(first).toBe('https://signed/1');
    expect(mockApiGet).toHaveBeenCalledWith(
      '/documents/doc-1/download-url?expiresIn=600',
    );
    expect(result.current.url).toBe('https://signed/1');

    await act(async () => {
      await result.current.fetch();
    });
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('uses a custom endpoint and reports failures', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      useSignedUrl('doc-2', { path: '/auth/me/documents/doc-2/download-url' }),
    );

    let url: string | null = 'unset';
    await act(async () => {
      url = await result.current.fetch();
    });
    expect(url).toBeNull();
    expect(mockApiGet).toHaveBeenCalledWith(
      '/auth/me/documents/doc-2/download-url',
    );
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });
});

describe('DocumentPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({ url: 'https://signed/file', expiresIn: 600 });
  });

  it('opens a PDF in an iframe modal after fetching the URL on click', async () => {
    const user = userEvent.setup();
    render(
      <DocumentPreview
        documentId="pdf-1"
        fileName="contract.pdf"
        fileType="application/pdf"
        fileSizeBytes={2048}
      />,
    );
    expect(mockApiGet).not.toHaveBeenCalled();

    await user.click(
      screen.getAllByRole('button', {
        name: 'common.previewFile:contract.pdf',
      })[0]!,
    );

    await waitFor(() =>
      expect(document.querySelector('iframe')).toHaveAttribute(
        'src',
        'https://signed/file',
      ),
    );
    expect(mockApiGet).toHaveBeenCalledWith(
      '/documents/pdf-1/download-url?expiresIn=600',
    );
    expect(document.querySelector('iframe')).toHaveAttribute(
      'title',
      'contract.pdf',
    );
  });

  it('is download-only for spreadsheets and keeps the default URL lifetime', async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(
      <DocumentPreview
        documentId="xls-1"
        fileName="budget.xlsx"
        fileType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        fileSizeBytes={10}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /common\.previewFile/ }),
    ).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'common.downloadFile:budget.xlsx' }),
    );
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(mockApiGet).toHaveBeenCalledWith('/documents/xls-1/download-url');
    click.mockRestore();
  });

  it('opens grouped images in one lightbox, fetching each URL on demand', async () => {
    const user = userEvent.setup();
    mockApiGet.mockImplementation((path: string) =>
      Promise.resolve({ url: `https://signed${path}`, expiresIn: 600 }),
    );
    render(
      <DocumentPreviewGroup
        documents={[
          { id: 'img-1', name: 'front.jpg', fileType: 'image/jpeg' },
          { id: 'img-2', name: 'back.png', fileType: 'image/png' },
          { id: 'pdf-9', name: 'notes.pdf', fileType: 'application/pdf' },
        ]}
      />,
    );
    expect(mockApiGet).not.toHaveBeenCalled();

    await user.click(
      screen.getAllByRole('button', { name: 'common.previewFile:back.png' })[0]!,
    );

    await waitFor(() =>
      expect(
        document.querySelector(
          'img[src="https://signed/documents/img-2/download-url?expiresIn=600"]',
        ),
      ).not.toBeNull(),
    );
    // Only the opened image was requested.
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    // The image fills the viewport instead of antd's 70%-height natural size.
    const previewImg = document.querySelector<HTMLImageElement>(
      'img[src="https://signed/documents/img-2/download-url?expiresIn=600"]',
    )!;
    expect(previewImg.style.objectFit).toBe('contain');
    expect(previewImg.style.maxHeight).toBe('none');
  });
});
