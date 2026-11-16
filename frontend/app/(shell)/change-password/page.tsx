'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Form, Input } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import BrandLogo from '@/components/ui/BrandLogo/BrandLogo';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { ApiRequestError } from '@/lib/api/errors';
import {
  clearPendingTemporaryPassword,
  peekPendingTemporaryPassword,
} from '@/lib/auth/pending-temporary-password';
import { useChangePassword } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';

interface FormValues {
  newPassword: string;
  confirmPassword: string;
}

type ForceChangeLabels = {
  heading: string;
  subheading: string;
  newPassword: string;
  confirmPassword: string;
  submit: string;
  required: string;
  minLength: string;
  mismatch: string;
  loginNameConflict: string;
  missingOtp: string;
  sameAsCurrent: string;
  sessionExpired: string;
  networkError: string;
  genericError: string;
  backToSignIn: string;
};

function useChangePasswordLabels(): ForceChangeLabels {
  return useMemo(() => {
    const lang =
      typeof document !== 'undefined'
        ? document.documentElement.lang || navigator.language
        : 'en';
    const isZh = lang.toLowerCase().startsWith('zh');
    return isZh
      ? {
          heading: '设置密码',
          subheading: '继续使用前，必须设置新密码。',
          newPassword: '新密码',
          confirmPassword: '确认新密码',
          submit: '设置密码',
          required: '必填',
          minLength: '至少 8 个字符',
          mismatch: '两次输入的新密码不一致，请重新输入。',
          loginNameConflict: '新密码不能与登录名相同，请换一个密码。',
          missingOtp: '登录信息已失效。请使用一次性密码重新登录后再设置密码。',
          sameAsCurrent: '新密码不能与一次性密码相同，请设置一个不同的密码。',
          sessionExpired: '登录已过期。请重新登录后再设置密码。',
          networkError: '无法连接服务器。请检查网络后重试。',
          genericError: '设置密码失败。请稍后重试，或重新登录后再试。',
          backToSignIn: '返回登录',
        }
      : {
          heading: 'Set your password',
          subheading: 'You must set a new password before continuing.',
          newPassword: 'New password',
          confirmPassword: 'Confirm new password',
          submit: 'Set Password',
          required: 'Required',
          minLength: 'At least 8 characters',
          mismatch: 'The two passwords do not match. Please try again.',
          loginNameConflict:
            'Your new password cannot be the same as your login name.',
          missingOtp:
            'Your sign-in details expired. Please sign in again with your one-time password, then set a new password.',
          sameAsCurrent:
            'Your new password must be different from the one-time password.',
          sessionExpired:
            'Your session expired. Please sign in again, then set your password.',
          networkError:
            'Could not reach the server. Check your connection and try again.',
          genericError:
            'Could not set your password. Please try again, or sign in again if the problem continues.',
          backToSignIn: 'Back to sign in',
        };
  }, []);
}

/**
 * Maps API / network failures to short messages users can act on.
 */
function friendlyChangePasswordError(
  error: unknown,
  labels: ForceChangeLabels,
): { message: string; offerSignIn: boolean } {
  if (!(error instanceof ApiRequestError)) {
    return { message: labels.genericError, offerSignIn: false };
  }

  const raw = error.message.toLowerCase();

  if (error.status === 0 || /network|timeout|failed to fetch/i.test(raw)) {
    return { message: labels.networkError, offerSignIn: false };
  }

  if (
    error.status === 401 ||
    error.status === 403 ||
    /session|unauthorized|must change password|forbidden/i.test(raw)
  ) {
    return { message: labels.sessionExpired, offerSignIn: true };
  }

  if (
    /different from the current|same as the current|must be different/i.test(
      raw,
    )
  ) {
    return { message: labels.sameAsCurrent, offerSignIn: false };
  }

  if (/login name|equal the login/i.test(raw)) {
    return { message: labels.loginNameConflict, offerSignIn: false };
  }

  if (/at least \d+ characters|min.*8|too short/i.test(raw)) {
    return { message: labels.minLength, offerSignIn: false };
  }

  if (/current password is incorrect/i.test(raw)) {
    return { message: labels.missingOtp, offerSignIn: true };
  }

  // Prefer a clear API message when it is already readable; otherwise generic.
  if (error.message.trim().length > 0 && error.message.length < 160) {
    return { message: error.message, offerSignIn: false };
  }

  return { message: labels.genericError, offerSignIn: false };
}

/**
 * Forced first-login password change. Never asks for the current password —
 * the OTP/temporary password from login is sent as currentPassword to the API.
 */
export default function ForceChangePasswordPage(): React.ReactNode {
  const router = useRouter();
  const changePassword = useChangePassword();
  const updateUser = useAuthStore((s) => s.updateUser);
  const loginName = useAuthStore((s) => s.user?.loginName);
  const labels = useChangePasswordLabels();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offerSignIn, setOfferSignIn] = useState(false);
  // Captured once from the login hand-off; never shown as a form field.
  const [signInPassword] = useState<string | null>(() =>
    peekPendingTemporaryPassword(),
  );

  async function handleSubmit(values: FormValues): Promise<void> {
    setErrorMessage(null);
    setOfferSignIn(false);

    if (values.newPassword !== values.confirmPassword) {
      setErrorMessage(labels.mismatch);
      return;
    }
    if (
      loginName &&
      values.newPassword.trim().toLowerCase() === loginName.trim().toLowerCase()
    ) {
      setErrorMessage(labels.loginNameConflict);
      return;
    }

    const currentPassword =
      signInPassword ?? peekPendingTemporaryPassword() ?? '';
    if (!currentPassword) {
      setErrorMessage(labels.missingOtp);
      setOfferSignIn(true);
      return;
    }

    try {
      await changePassword.mutateAsync({
        currentPassword,
        newPassword: values.newPassword,
      });
      clearPendingTemporaryPassword();
      updateUser({ mustChangePassword: false });
      router.replace('/');
    } catch (error) {
      const friendly = friendlyChangePasswordError(error, labels);
      setErrorMessage(friendly.message);
      setOfferSignIn(friendly.offerSignIn);
    }
  }

  return (
    <div className="erp-login-page">
      <div className="erp-login-stage">
        <header className="erp-login-topbar">
          <BrandLogo size={48} priority className="erp-login-topbar-logo" />
          <span className="erp-login-topbar-divider" aria-hidden />
          <span className="erp-login-topbar-product">Construction ERP</span>
        </header>

        <main className="erp-login-main">
          <div className="erp-login-layout">
            <section
              className="erp-login-panel"
              aria-labelledby="erp-change-password-heading"
            >
              <header className="erp-login-panel-head">
                <h1
                  id="erp-change-password-heading"
                  className="erp-login-heading"
                >
                  {labels.heading}
                </h1>
                <p className="erp-login-subtitle">{labels.subheading}</p>
              </header>

              <Form<FormValues>
                layout="vertical"
                requiredMark={false}
                className="erp-login-form"
                onFinish={(values) => void handleSubmit(values)}
              >
                <Form.Item
                  label={labels.newPassword}
                  name="newPassword"
                  rules={[
                    { required: true, message: labels.required },
                    { min: 8, message: labels.minLength },
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined aria-hidden />}
                    autoComplete="new-password"
                    size="large"
                  />
                </Form.Item>
                <Form.Item
                  label={labels.confirmPassword}
                  name="confirmPassword"
                  rules={[{ required: true, message: labels.required }]}
                >
                  <Input.Password
                    prefix={<LockOutlined aria-hidden />}
                    autoComplete="new-password"
                    size="large"
                  />
                </Form.Item>

                {errorMessage ? (
                  <ErpNotice tone="error" className="mb-4" title={errorMessage} />
                ) : null}

                {offerSignIn ? (
                  <p className="erp-login-help mb-4">
                    <Link href="/login" className="erp-login-forgot-link">
                      {labels.backToSignIn}
                    </Link>
                  </p>
                ) : null}

                <Form.Item className="!mb-0 !mt-1">
                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={changePassword.isPending}
                    className="erp-login-submit"
                  >
                    {labels.submit}
                  </Button>
                </Form.Item>
              </Form>
            </section>
          </div>
        </main>

        <footer className="erp-login-footer">
          © {new Date().getFullYear()} CRCC · Construction ERP
        </footer>
      </div>

      <aside className="erp-login-brand" aria-label="CRCC">
        <div className="erp-login-brand-atmosphere" aria-hidden>
          <span className="erp-login-brand-grid" />
          <span className="erp-login-brand-glow" />
          <span className="erp-login-brand-globe" />
        </div>
        <div className="erp-login-brand-inner">
          <p className="erp-login-brand-eyebrow">CRCC · Construction ERP</p>
          <p className="erp-login-brand-title">{labels.subheading}</p>
        </div>
      </aside>
    </div>
  );
}
