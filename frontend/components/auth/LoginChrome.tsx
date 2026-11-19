'use client';

import { SafetyOutlined } from '@ant-design/icons';
import BrandLogo from '@/components/ui/BrandLogo/BrandLogo';
import { useIsZhDocument } from '@/components/auth/auth-lang';

/** Logo lockup above the sign-in form (login, password and activation pages). */
export function LoginTopbar(): React.ReactNode {
  const isZh = useIsZhDocument();
  return (
    <header className="erp-login-topbar">
      <BrandLogo size={44} priority className="erp-login-topbar-logo" />
      <span className="erp-login-topbar-divider" aria-hidden />
      <span className="erp-login-topbar-lockup">
        <span className="erp-login-topbar-product">CRCC ERP</span>
        <span className="erp-login-topbar-branch">
          {isZh ? '埃塞俄比亚分公司' : 'Ethiopia Branch'}
        </span>
      </span>
    </header>
  );
}

/** Copyright and access notice under the sign-in form. */
export function LoginFooter(): React.ReactNode {
  const isZh = useIsZhDocument();
  return (
    <footer className="erp-login-footer">
      <span>
        © {new Date().getFullYear()}{' '}
        {isZh ? '中国铁建埃塞俄比亚分公司' : 'CRCC Ethiopia Branch'}
      </span>
      <span className="erp-login-footer-notice">
        <SafetyOutlined aria-hidden />
        {isZh ? '仅限授权人员使用' : 'Authorized personnel only'}
      </span>
    </footer>
  );
}
