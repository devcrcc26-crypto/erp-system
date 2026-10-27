'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import HelpContent from '@/components/help/HelpContent';
import { useHelpLang } from '@/components/help/HelpLangContext';
import {
  getHelpModule,
  getVisibleModules,
  isValidHelpSlug,
} from '@/lib/help/modules';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useCurrentUser } from '@/lib/query/profile';

/**
 * Fully client-side guide page. All hooks run unconditionally; invalid slugs
 * render a simple message (no notFound() between hooks).
 */
export default function HelpModulePage(): ReactNode {
  const params = useParams<{ module: string }>();
  const slug = typeof params.module === 'string' ? params.module : '';
  const { lang } = useHelpLang();
  const router = useRouter();
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
    if (!mod) {
      return;
    }
    if (waitingForProfile || allowed || slug === 'getting-started') {
      return;
    }
    router.replace('/help/getting-started');
  }, [allowed, waitingForProfile, router, slug, mod]);

  useEffect(() => {
    if (!mod) {
      setContent('');
      setLoadingContent(false);
      return;
    }

    let cancelled = false;
    setLoadingContent(true);

    async function load(): Promise<void> {
      const primary = `/guide/${lang}/${slug}.md`;
      const fallback = `/guide/en/${slug}.md`;
      try {
        let res = await fetch(primary, { cache: 'force-cache' });
        if (!res.ok && lang !== 'en') {
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
  }, [lang, slug, mod]);

  if (!mod) {
    return (
      <article>
        <h1 className="mb-6 border-b border-slate-200 pb-4 text-2xl font-bold text-slate-900">
          {lang === 'zh' ? '未找到' : 'Not found'}
        </h1>
        <p className="text-slate-600">
          {lang === 'zh' ? '该手册章节不存在。' : 'This guide topic does not exist.'}
        </p>
      </article>
    );
  }

  const title = lang === 'zh' ? mod.titleZh : mod.titleEn;

  return (
    <article>
      <h1 className="mb-6 border-b border-slate-200 pb-4 text-2xl font-bold text-slate-900">
        {title}
      </h1>
      {loadingContent || waitingForProfile ? (
        <p className="text-sm text-slate-500">
          {lang === 'zh' ? '加载中…' : 'Loading…'}
        </p>
      ) : (
        <HelpContent content={content} />
      )}
    </article>
  );
}
