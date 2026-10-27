'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Spin } from 'antd';
import HelpContent from '@/components/help/HelpContent';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { getHelpModule } from '@/lib/help/modules';

/**
 * Loads one guide topic in the ERP language (header Language control) and
 * renders it. The markdown's own `# Title` is dropped; the topic title from
 * `lib/help/modules.ts` is shown in the article header instead.
 */
export default function HelpArticle({ slug }: { slug: string }): ReactNode {
  const { locale } = useEpcTranslation();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const mod = getHelpModule(slug);
  const title = (locale === 'zh' ? mod?.titleZh : mod?.titleEn) ?? slug;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load(): Promise<void> {
      try {
        // Revalidate so edited guides show up at once instead of a cached copy.
        let res = await fetch(`/guide/${locale}/${slug}.md`, { cache: 'no-cache' });
        if (!res.ok && locale !== 'en') {
          res = await fetch(`/guide/en/${slug}.md`, { cache: 'no-cache' });
        }
        if (!res.ok) {
          throw new Error('missing');
        }
        const text = await res.text();
        if (!cancelled) {
          setContent(text);
        }
      } catch {
        if (!cancelled) {
          setContent(locale === 'zh' ? '内容即将发布。' : 'Content coming soon.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [locale, slug]);

  if (loading) {
    return (
      <div className="erp-pro-card flex justify-center py-16">
        <Spin />
      </div>
    );
  }

  return (
    <HelpContent
      content={content.replace(/^\s*#\s+[^\n]*\n*/, '')}
      title={title}
      iconKey={`guide-${slug}`}
    />
  );
}
