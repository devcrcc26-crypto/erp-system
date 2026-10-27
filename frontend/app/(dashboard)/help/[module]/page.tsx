'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Spin } from 'antd';
import HelpContent from '@/components/help/HelpContent';
import { HelpGettingStartedPage } from '@/components/help/HelpGettingStartedPage';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  getHelpModule,
  getVisibleModules,
  isValidHelpSlug,
} from '@/lib/help/modules';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useCurrentUser } from '@/lib/query/profile';

/**
 * Fully client-side guide page. All hooks run unconditionally.
 * Forbidden topics show Getting Started in place — never router.replace
 * (avoids Next.js 16 App Router "Rendered more hooks" on soft redirects).
 * Guide language follows the ERP header Language control.
 */
export default function HelpModulePage(): ReactNode {
  const params = useParams<{ module: string }>();
  const slug = typeof params.module === 'string' ? params.module : '';
  const { locale } = useEpcTranslation();
  const { data: profile, isPending } = useCurrentUser();
  const canViewHr = useCanViewHr();
  const [content, setContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(true);

  const mod = isValidHelpSlug(slug) ? getHelpModule(slug) : undefined;
  const roleNames = (profile?.roles ?? []).map((role) => role.name);
  const waitingForProfile = isPending && !profile;
  const allowed =
    Boolean(mod) &&
    !waitingForProfile &&
    getVisibleModules(roleNames, canViewHr).some((m) => m.slug === slug);

  useEffect(() => {
    if (!mod || !allowed) {
      setContent('');
      setLoadingContent(false);
      return;
    }

    let cancelled = false;
    setLoadingContent(true);

    async function load(): Promise<void> {
      const primary = `/guide/${locale}/${slug}.md`;
      const fallback = `/guide/en/${slug}.md`;
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
  }, [locale, slug, mod, allowed]);

  if (!mod) {
    return (
      <article>
        <h1 className="mb-6 border-b border-slate-200 pb-4 text-2xl font-bold text-slate-900">
          {locale === 'zh' ? '未找到' : 'Not found'}
        </h1>
        <p className="text-slate-600">
          {locale === 'zh' ? '该手册章节不存在。' : 'This guide topic does not exist.'}
        </p>
        <p className="mt-4">
          <Link
            href="/help/getting-started"
            className="font-medium text-[#0F6E56] underline-offset-2 hover:underline"
          >
            {locale === 'zh' ? '返回快速开始' : 'Back to Getting started'}
          </Link>
        </p>
      </article>
    );
  }

  if (!waitingForProfile && !allowed) {
    return (
      <div className="flex flex-col gap-4">
        <Alert
          type="info"
          showIcon
          className="!rounded-xl"
          title={
            locale === 'zh'
              ? '您没有权限查看该章节，已显示快速开始。'
              : 'You do not have access to that topic. Showing Getting started instead.'
          }
        />
        <HelpGettingStartedPage />
      </div>
    );
  }

  const title = locale === 'zh' ? mod.titleZh : mod.titleEn;
  const body = content.replace(/^\s*#\s+[^\n]*\n*/, '');

  return (
    <article>
      <h1 className="mb-5 border-b border-[#EEF1F4] pb-4 text-xl font-semibold text-[rgba(0,0,0,0.88)]">
        {title}
      </h1>
      {loadingContent || waitingForProfile ? (
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      ) : (
        <HelpContent content={body} />
      )}
    </article>
  );
}
