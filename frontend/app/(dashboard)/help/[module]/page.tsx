'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Spin } from 'antd';
import HelpArticle from '@/components/help/HelpArticle';
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

  const mod = isValidHelpSlug(slug) ? getHelpModule(slug) : undefined;
  const roleNames = (profile?.roles ?? []).map((role) => role.name);
  const waitingForProfile = isPending && !profile;
  const allowed =
    Boolean(mod) &&
    !waitingForProfile &&
    getVisibleModules(roleNames, canViewHr).some((m) => m.slug === slug);

  if (!mod) {
    return (
      <article className="erp-pro-card px-6 py-5">
        <h1 className="m-0 text-[20px] font-semibold leading-8 text-[rgba(0,0,0,0.88)]">
          {locale === 'zh' ? '未找到' : 'Not found'}
        </h1>
        <p className="mb-0 mt-1 text-[14px] text-[rgba(0,0,0,0.65)]">
          {locale === 'zh' ? '该手册章节不存在。' : 'This guide topic does not exist.'}
        </p>
        <p className="mb-0 mt-4">
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

  if (waitingForProfile) {
    return (
      <div className="erp-pro-card flex justify-center py-16">
        <Spin />
      </div>
    );
  }

  return <HelpArticle slug={slug} />;
}
