'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { EpcLocale } from '@/lib/i18n/epc-messages';
import { getVisibleModules, type HelpModule } from '@/lib/help/modules';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useCurrentUser } from '@/lib/query/profile';

/**
 * User guide inside the ERP shell. Auth, sidebar and header come from the
 * dashboard layout; this only adds the topic list and the article card.
 * Guide language follows the header Language control (preferredLanguage).
 */
export default function HelpLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <HelpShell>{children}</HelpShell>;
}

function HelpShell({ children }: { children: ReactNode }): ReactNode {
  const { locale } = useEpcTranslation();
  const { data: profile } = useCurrentUser();
  const canViewHr = useCanViewHr();
  const roleNames = (profile?.roles ?? []).map((role) => role.name);
  const modules = getVisibleModules(roleNames, canViewHr);

  const pathname = usePathname();
  const articleRef = useRef<HTMLDivElement>(null);

  // The article panel persists between topics, so start each topic at the top.
  useEffect(() => {
    articleRef.current?.scrollTo({ top: 0 });
  }, [pathname, locale]);

  // On desktop the topic list and the article scroll independently; on
  // smaller screens they stack and the page scrolls as usual.
  return (
    <div className="erp-help-page lg:h-full">
      <div className="grid grid-cols-1 gap-4 lg:h-full lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <aside className="erp-pro-card flex min-h-0 flex-col">
          <div className="erp-pro-card-toolbar shrink-0">
            <p className="erp-pro-card-toolbar-title">
              {locale === 'zh' ? '目录' : 'Topics'}
            </p>
          </div>
          <div className="min-h-0 flex-1 p-2 lg:overflow-y-auto">
            <HelpNav modules={modules} locale={locale} />
          </div>
        </aside>
        <section className="erp-pro-card flex min-h-0 min-w-0 flex-col">
          <div
            ref={articleRef}
            tabIndex={0}
            role="region"
            aria-label={locale === 'zh' ? '手册内容' : 'Guide content'}
            className="min-h-0 flex-1 px-6 py-6 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1D9E75] md:px-8 lg:overflow-y-auto"
          >
            <div className="mx-auto max-w-[860px]">{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

function HelpNav({
  modules,
  locale,
}: {
  modules: readonly HelpModule[];
  locale: EpcLocale;
}): ReactNode {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Keep the open topic visible in the scrolling topic panel (desktop only;
  // on mobile the list is part of the page and must not jump the page).
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      activeRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [pathname, modules.length]);

  return (
    <nav aria-label={locale === 'zh' ? '使用手册目录' : 'User guide topics'}>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {modules.map((mod) => {
          const href = `/help/${mod.slug}`;
          // `/help` itself shows Getting Started.
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (pathname === '/help' && mod.slug === 'getting-started');
          const label = locale === 'zh' ? mod.titleZh : mod.titleEn;
          return (
            <li key={mod.slug}>
              <Link
                ref={active ? activeRef : undefined}
                href={href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-md px-3 py-2 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D9E75] ${
                  active
                    ? '!bg-[#E1F5EE] !font-semibold !text-[#0F6E56]'
                    : '!text-[rgba(0,0,0,0.65)] hover:!bg-[#FAFAFA] hover:!text-[rgba(0,0,0,0.88)]'
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
