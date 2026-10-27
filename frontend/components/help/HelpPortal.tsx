'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { X } from 'lucide-react';
import {
  HelpLangProvider,
  useHelpLang,
  type HelpLang,
} from '@/components/help/HelpLangContext';
import { getVisibleModules, type HelpModule } from '@/lib/help/modules';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useCapabilitiesReady } from '@/hooks/use-pm-capabilities';
import { useSessionCapabilities } from '@/lib/query/auth';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Single client boundary for `/help`.
 *
 * Waits for Zustand persist hydration before any login redirect — otherwise a
 * new tab briefly sees no token, clears the auth cookie, soft-navs to /login,
 * and the proxy bounces an still-authenticated cookie to `/`.
 */
export default function HelpPortal({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionId = useAuthStore((state) => state.sessionId);

  const sessionConfirmed =
    hydrated && Boolean(accessToken) && Boolean(sessionId);

  useSessionCapabilities(sessionConfirmed);
  const capabilitiesReady = useCapabilitiesReady();
  const ready = sessionConfirmed && capabilitiesReady;

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!accessToken) {
      const from = encodeURIComponent(pathname || '/help');
      router.replace(`/login?from=${from}`);
    }
  }, [hydrated, accessToken, pathname, router]);

  return (
    <HelpLangProvider>
      <div className="relative min-h-screen bg-white">
        {!ready ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-50">
            <Spin size="large" />
          </div>
        ) : null}
        <div
          className={ready ? undefined : 'pointer-events-none invisible'}
          aria-hidden={!ready}
        >
          <HelpChrome>{children}</HelpChrome>
        </div>
      </div>
    </HelpLangProvider>
  );
}

function HelpChrome({ children }: { children: ReactNode }): ReactNode {
  const { lang, setLang } = useHelpLang();
  const { data: profile } = useCurrentUser();
  const canViewHr = useCanViewHr();
  const roleNames = (profile?.roles ?? []).map((role) => role.name);
  const modules = getVisibleModules(roleNames, canViewHr);

  const brandTitle = lang === 'zh' ? '使用手册' : 'User Guide';
  const brandSub = lang === 'zh' ? 'User Guide' : '使用手册';
  const closeLabel = lang === 'zh' ? '关闭并返回系统' : 'Close and return to ERP';

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-900">
      <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-4 py-4">
          <p className="text-lg font-semibold text-slate-900">{brandTitle}</p>
          <p className="mt-0.5 text-xs text-slate-500">{brandSub}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <HelpNav modules={modules} lang={lang} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <LanguageToggle lang={lang} setLang={setLang} />
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            aria-label={closeLabel}
          >
            <X className="h-4 w-4" aria-hidden />
            <span>{lang === 'zh' ? '关闭' : 'Close'}</span>
          </a>
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mx-auto max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function LanguageToggle({
  lang,
  setLang,
}: {
  lang: HelpLang;
  setLang: (lang: HelpLang) => void;
}): ReactNode {
  return (
    <div
      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
      role="group"
      aria-label="Guide language"
    >
      {(
        [
          { id: 'en', label: 'EN' },
          { id: 'zh', label: '中文' },
        ] as const
      ).map((option) => {
        const active = lang === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => setLang(option.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function HelpNav({
  modules,
  lang,
}: {
  modules: readonly HelpModule[];
  lang: HelpLang;
}): ReactNode {
  const pathname = usePathname();

  return (
    <nav aria-label={lang === 'zh' ? '使用手册目录' : 'User guide topics'}>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {modules.map((mod) => {
          const href = `/help/${mod.slug}`;
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          const label = lang === 'zh' ? mod.titleZh : mod.titleEn;
          return (
            <li key={mod.slug}>
              <Link
                href={href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                  active
                    ? 'bg-emerald-50 font-semibold text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
