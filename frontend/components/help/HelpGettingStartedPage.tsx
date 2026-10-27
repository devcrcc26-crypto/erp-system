'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Spin } from 'antd';
import HelpContent from '@/components/help/HelpContent';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { getHelpModule } from '@/lib/help/modules';

const SLUG = 'getting-started';

/**
 * Getting Started article without any client/server redirect.
 * Used by both `/help` and as the safe fallback when a topic is forbidden.
 * Language follows the ERP header Language control.
 */
export function HelpGettingStartedPage(): ReactNode {
  const { locale } = useEpcTranslation();
  const [content, setContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(true);
  const mod = getHelpModule(SLUG);
  const title = locale === 'zh' ? mod?.titleZh : mod?.titleEn;

  useEffect(() => {
    let cancelled = false;
    setLoadingContent(true);

    async function load(): Promise<void> {
      const primary = `/guide/${locale}/${SLUG}.md`;
      const fallback = `/guide/en/${SLUG}.md`;
      try {
        let res = await fetch(primary, { cache: 'force-cache' });
        if (!res.ok && locale !== 'en') {
          res = await fetch(fallback, { cache: 'force-cache' });
        }
        if (!res.ok) {
          throw new Error('missing');
        }
        const text = await res.text();
        if (!cancelled) {
          setContent(text);
          setLoadingContent(false);
        }
      } catch {
        if (!cancelled) {
          setContent('# Content coming soon\n\n内容即将发布。\n');
          setLoadingContent(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const body = content.replace(/^\s*#\s+[^\n]*\n*/, '');

  return (
    <article>
      <h1 className="mb-5 border-b border-[#EEF1F4] pb-4 text-xl font-semibold text-[rgba(0,0,0,0.88)]">
        {title ?? (locale === 'zh' ? '快速开始' : 'Getting started')}
      </h1>
      {loadingContent ? (
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      ) : (
        <HelpContent content={body} />
      )}
    </article>
  );
}
