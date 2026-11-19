'use client';

import { useMemo } from 'react';
import {
  CheckCircleOutlined,
  CustomerServiceOutlined,
  FormOutlined,
  IdcardOutlined,
  NotificationOutlined,
} from '@ant-design/icons';
import { useIsZhDocument } from '@/components/auth/auth-lang';

interface BrandPanelCopy {
  company: string;
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
        company: '中国铁建埃塞俄比亚分公司',
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
      company: 'CRCC Ethiopia Branch',
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

/**
 * Right-hand brand panel shared by the login, password and activation pages.
 * Visible from lg (1024px) up; see `.erp-login-brand` in globals.css.
 */
export function LoginBrandPanel(): React.ReactNode {
  const copy = useBrandPanelCopy();

  return (
    <aside className="erp-login-brand" aria-label={copy.company}>
      <div className="erp-login-brand-atmosphere" aria-hidden>
        <span className="erp-login-brand-grid" />
        <span className="erp-login-brand-glow" />
        <span className="erp-login-brand-globe" />
      </div>

      <div className="erp-login-brand-content">
        <div className="erp-login-brand-company">
          <p className="erp-login-brand-company-name">{copy.company}</p>
          <span className="erp-login-brand-accent" aria-hidden />
        </div>

        <div className="erp-login-brand-body">
          <h2 className="erp-login-brand-heading">{copy.heading}</h2>
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
