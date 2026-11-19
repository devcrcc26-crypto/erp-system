'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  CheckCircleOutlined,
  CustomerServiceOutlined,
  FormOutlined,
  IdcardOutlined,
  NotificationOutlined,
} from '@ant-design/icons';
import { useIsZhDocument } from '@/components/auth/auth-lang';

interface BrandPanelCopy {
  heading: string;
  features: ReadonlyArray<{ title: string; detail: string }>;
  helpTitle: string;
  helpDetail: string;
}

const FEATURE_ICONS = [
  FormOutlined,
  CheckCircleOutlined,
  NotificationOutlined,
  IdcardOutlined,
] as const;

function useBrandPanelCopy(): BrandPanelCopy {
  const isZh = useIsZhDocument();
  return useMemo(() => {
    if (isZh) {
      return {
        heading: '工作所需，一站办理',
        features: [
          { title: '提交申请', detail: '请假、加班、出差与报销' },
          { title: '跟踪审批', detail: '随时查看每个申请的进度' },
          { title: '公司公告', detail: '人力资源部的新闻与通知' },
          { title: '个人档案与工牌', detail: '个人信息和员工工牌' },
        ],
        helpTitle: '登录遇到问题？',
        helpDetail: '账户或密码问题，请联系人力资源部。',
      };
    }
    return {
      heading: 'Everything you need at work, in one place',
      features: [
        {
          title: 'Submit requests',
          detail: 'Leave, overtime, travel and expense claims',
        },
        {
          title: 'Track approvals',
          detail: 'See where every request stands',
        },
        {
          title: 'Company announcements',
          detail: 'News and notices from HR',
        },
        {
          title: 'Your profile and ID card',
          detail: 'Personal details and your employee ID card',
        },
      ],
      helpTitle: 'Need help signing in?',
      helpDetail: 'Contact the HR office for account or password help.',
    };
  }, [isZh]);
}

const MINUTE_MS = 60_000;

/** Re-renders once a minute, aligned to the start of the minute. */
function subscribeToMinute(onChange: () => void): () => void {
  let interval: ReturnType<typeof setInterval> | undefined;
  const timeout = setTimeout(() => {
    onChange();
    interval = setInterval(onChange, MINUTE_MS);
  }, MINUTE_MS - (Date.now() % MINUTE_MS));
  return () => {
    clearTimeout(timeout);
    if (interval) clearInterval(interval);
  };
}

/** Current minute on the client; null during SSR so the markup matches. */
function useCurrentMinute(): number | null {
  return useSyncExternalStore(
    subscribeToMinute,
    () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS,
    () => null,
  );
}

/** Live local time and date for the top of the panel. */
function BrandPanelClock({ isZh }: { isZh: boolean }): React.ReactNode {
  const minute = useCurrentMinute();
  if (minute === null) return null;
  const now = new Date(minute);
  const locale = isZh ? 'zh-CN' : 'en-GB';
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return (
    <time className="erp-login-brand-clock" dateTime={now.toISOString()}>
      <span className="erp-login-brand-clock-time">{time}</span>
      <span className="erp-login-brand-clock-date">{date}</span>
    </time>
  );
}

/**
 * Right-hand brand panel shared by the login, password and activation pages.
 * Visible from lg (1024px) up; see `.erp-login-brand` in globals.css.
 */
export function LoginBrandPanel(): React.ReactNode {
  const copy = useBrandPanelCopy();
  const isZh = useIsZhDocument();

  return (
    <aside className="erp-login-brand" aria-labelledby="erp-login-brand-heading">
      <div className="erp-login-brand-atmosphere" aria-hidden>
        <span className="erp-login-brand-grid" />
        <span className="erp-login-brand-glow" />
        <span className="erp-login-brand-globe" />
      </div>

      <div className="erp-login-brand-content">
        <div className="erp-login-brand-top">
          <BrandPanelClock isZh={isZh} />
        </div>

        <div className="erp-login-brand-body">
          <span className="erp-login-brand-accent" aria-hidden />
          <h2
            id="erp-login-brand-heading"
            className="erp-login-brand-heading"
          >
            {copy.heading}
          </h2>
          <ul className="erp-login-brand-features">
            {copy.features.map((feature, index) => {
              const Icon = FEATURE_ICONS[index] ?? FormOutlined;
              return (
                <li key={feature.title} className="erp-login-brand-feature">
                  <span className="erp-login-brand-feature-icon" aria-hidden>
                    <Icon />
                  </span>
                  <span>
                    <span className="erp-login-brand-feature-title">
                      {feature.title}
                    </span>
                    <span className="erp-login-brand-feature-detail">
                      {feature.detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="erp-login-brand-help">
            <span className="erp-login-brand-help-icon" aria-hidden>
              <CustomerServiceOutlined />
            </span>
            <span>
              <span className="erp-login-brand-help-title">
                {copy.helpTitle}
              </span>
              <span className="erp-login-brand-help-detail">
                {copy.helpDetail}
              </span>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
