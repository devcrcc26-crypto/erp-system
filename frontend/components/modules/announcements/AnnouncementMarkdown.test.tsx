import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AnnouncementMarkdown, { safeHref } from './AnnouncementMarkdown';

describe('AnnouncementMarkdown', () => {
  it('renders <script> and other raw HTML as inert text', () => {
    const { container } = render(
      <AnnouncementMarkdown
        source={'Hello **team**\n<script>alert("x")</script>\n<img src=x onerror="alert(1)">'}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('team');
    expect(container.textContent).toContain('<script>alert("x")</script>');
  });

  it('opens safe links in a new tab and drops script-capable ones', () => {
    const { container } = render(
      <AnnouncementMarkdown
        source={'[Policy](https://example.com/policy) and [bad](javascript:alert(1)) and [home](/announcements)'}
      />,
    );
    const links = [...container.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/policy',
      '/announcements',
    ]);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(container.textContent).toContain('bad');
  });

  it('renders headings, lists and quotes', () => {
    const { container } = render(
      <AnnouncementMarkdown source={'# Title\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted'} />,
    );
    expect(container.querySelector('h2')?.textContent).toBe('Title');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('blockquote')?.textContent).toBe('quoted');
  });

  it('only allows http(s), mailto and in-app paths', () => {
    expect(safeHref('https://a.b')).toBe('https://a.b');
    expect(safeHref('mailto:hr@company.local')).toBe('mailto:hr@company.local');
    expect(safeHref('/hr/announcements')).toBe('/hr/announcements');
    expect(safeHref('//evil.example')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull();
  });
});
