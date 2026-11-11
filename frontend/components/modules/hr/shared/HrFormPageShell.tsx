'use client';

import { Button } from 'antd';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

export interface HrFormPageShellProps {
  /** Banner title (e.g. "New expense claim"). Shell header stays on the list title. */
  title: string;
  /** Banner subtitle / form lead. */
  description?: string;
  cancelLabel: string;
  /** Back-link + cancel target. Defaults to `/approvals/new` when omitted with onCancel. */
  cancelHref?: string;
  /** Label for the back link under the banner. Defaults to cancelHref destination. */
  backLabel?: string;
  onCancel?: () => void;
  /**
   * When false, keep the back link / cancelHref but hide the banner Cancel button
   * (e.g. Cancel lives in the stepper footer next to Back).
   */
  showCancelButton?: boolean;
  /** Extra controls next to Cancel in the banner. */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared HR / Approvals create-form chrome: in-page banner + cancel.
 * MainContentHeader should keep the module list title/subtitle via navConfig.
 */
export default function HrFormPageShell({
  title,
  description,
  cancelLabel,
  cancelHref,
  backLabel,
  onCancel,
  showCancelButton = true,
  headerExtra,
  children,
}: HrFormPageShellProps): React.ReactNode {
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleCancel(): void {
    if (onCancel) {
      onCancel();
      return;
    }
    if (cancelHref) {
      router.push(cancelHref);
    }
  }

  const showCancel =
    showCancelButton && Boolean(onCancel || cancelHref);
  const backHref = cancelHref;

  return (
    <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col gap-4">
      <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)] sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0 flex-1">
          {backHref ? (
            <Link
              href={backHref}
              className="mb-2 inline-flex items-center gap-1.5 rounded text-[13px] font-medium !text-slate-500 no-underline transition-colors hover:!text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              {backLabel ?? cancelLabel}
            </Link>
          ) : null}
          <h1 className="m-0 break-words text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 mb-0 max-w-3xl break-words text-[13px] leading-snug text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center [&>.ant-btn]:w-full sm:[&>.ant-btn]:w-auto">
          {headerExtra}
          {showCancel ? (
            <Button onClick={handleCancel}>{cancelLabel}</Button>
          ) : null}
        </div>
      </section>
      {children}
    </div>
  );
}
