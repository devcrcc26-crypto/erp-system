'use client';

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

function useChangePasswordLabels(): {
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
} {
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
          mismatch: '两次输入的新密码不一致',
          loginNameConflict: '密码不能与登录名相同',
          missingOtp: '登录会话已过期。请使用一次性密码重新登录。',
        }
      : {
          heading: 'Set your password',
          subheading: 'You must set a new password before continuing.',
          newPassword: 'New password',
          confirmPassword: 'Confirm new password',
          submit: 'Set Password',
          required: 'Required',
          minLength: 'At least 8 characters',
          mismatch: 'New passwords do not match',
          loginNameConflict: 'Password must not equal the login name',
          missingOtp:
            'Your sign-in session expired. Please sign in again with your one-time password.',
        };
  }, []);
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
  // Captured once from the login hand-off; never shown as a form field.
  const [signInPassword] = useState<string | null>(() =>
    peekPendingTemporaryPassword(),
  );

  async function handleSubmit(values: FormValues): Promise<void> {
    setErrorMessage(null);
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
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Could not change password. Please try again.');
      }
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
