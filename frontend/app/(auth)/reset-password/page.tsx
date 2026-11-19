'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Form, Input, Spin } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { LoginFooter, LoginTopbar } from '@/components/auth/LoginChrome';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { PriorSessionNotice } from '@/components/auth/PriorSessionNotice';
import { usePrepareIdentityAuthFlow } from '@/hooks/usePrepareIdentityAuthFlow';
import { useResetPassword } from '@/lib/query/auth';
import { ApiRequestError } from '@/lib/api/errors';

interface ResetFormValues {
  newPassword: string;
  confirmPassword: string;
}

function useResetPasswordLabels(): {
  heading: string;
  subtitle: (email: string) => string;
  newPassword: string;
  confirmPassword: string;
  required: string;
  minLength: string;
  mismatch: string;
  submit: string;
  submitting: string;
  invalidLink: string;
  expiredHint: string;
  forgotLink: string;
  backToSignIn: string;
  genericError: string;
  priorSession: string;
} {
  return useMemo(() => {
    const lang =
      typeof document !== 'undefined'
        ? document.documentElement.lang || navigator.language
        : 'en';
    const isZh = lang.toLowerCase().startsWith('zh');
    return isZh
      ? {
          heading: '重置密码',
          subtitle: (email: string) =>
            `为 ${email || '您的账户'} 设置新密码。`,
          newPassword: '新密码',
          confirmPassword: '确认新密码',
          required: '必填',
          minLength: '至少 8 个字符',
          mismatch: '两次输入的密码不一致。',
          submit: '重置密码',
          submitting: '重置中…',
          invalidLink: '重置链接无效或缺少必要参数。',
          expiredHint:
            '重置链接 2 小时后失效，且只能使用一次。请重新申请链接：',
          forgotLink: '忘记密码',
          backToSignIn: '返回登录',
          genericError: '密码重置失败。请重新申请链接。',
          priorSession: '已退出登录，以便继续完成密码重置。',
        }
      : {
          heading: 'Reset password',
          subtitle: (email: string) =>
            `Choose a new password for ${email || 'your account'}.`,
          newPassword: 'New password',
          confirmPassword: 'Confirm password',
          required: 'Required',
          minLength: 'At least 8 characters',
          mismatch: 'Passwords do not match.',
          submit: 'Reset password',
          submitting: 'Resetting…',
          invalidLink: 'Reset link is invalid or missing required parameters.',
          expiredHint:
            'Reset links expire after 2 hours and can only be used once. Request a new link from',
          forgotLink: 'forgot password',
          backToSignIn: 'Back to sign in',
          genericError: 'Password reset failed. Please request a new link.',
          priorSession:
            'You have been signed out so this password reset can continue.',
        };
  }, []);
}

function ResetPasswordForm(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetPassword = useResetPassword();
  const { priorUserEmail } = usePrepareIdentityAuthFlow();
  const labels = useResetPasswordLabels();

  const emailFromUrl = (searchParams.get('email') ?? '').trim().toLowerCase();
  const tokenFromUrl = (searchParams.get('token') ?? '').trim();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tokenFromUrl && !emailFromUrl) {
      router.replace(`/activate?token=${encodeURIComponent(tokenFromUrl)}`);
    }
  }, [tokenFromUrl, emailFromUrl, router]);

  async function handleSubmit(values: ResetFormValues): Promise<void> {
    setErrorMessage(null);

    if (!emailFromUrl || !tokenFromUrl) {
      setErrorMessage(labels.invalidLink);
      return;
    }

    if (values.newPassword !== values.confirmPassword) {
      setErrorMessage(labels.mismatch);
      return;
    }

    try {
      await resetPassword.mutateAsync({
        email: emailFromUrl,
        token: tokenFromUrl,
        newPassword: values.newPassword,
      });
      router.replace('/login?reset=1');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(labels.genericError);
      }
    }
  }

  const linkExpired = Boolean(
    errorMessage?.toLowerCase().includes('invalid or expired'),
  );

  return (
    <div className="erp-login-page">
      <div className="erp-login-stage">
        <LoginTopbar />

        <main className="erp-login-main">
          <div className="erp-login-layout">
            <section
              className="erp-login-panel"
              aria-labelledby="erp-reset-password-heading"
            >
              <header className="erp-login-panel-head">
                <h1
                  id="erp-reset-password-heading"
                  className="erp-login-heading"
                >
                  {labels.heading}
                </h1>
                <p className="erp-login-subtitle">
                  {labels.subtitle(emailFromUrl)}
                </p>
              </header>

              <Form<ResetFormValues>
                layout="vertical"
                requiredMark={false}
                className="erp-login-form"
                onFinish={(values) => void handleSubmit(values)}
              >
                <PriorSessionNotice
                  priorUserEmail={priorUserEmail}
                  message={labels.priorSession}
                />

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
                  <ErpNotice
                    tone="error"
                    className="mb-4"
                    title={errorMessage}
                  />
                ) : null}

                {linkExpired ? (
                  <p className="erp-login-help mb-4">
                    {labels.expiredHint}{' '}
                    <Link
                      href="/forgot-password"
                      className="erp-login-forgot-link"
                    >
                      {labels.forgotLink}
                    </Link>
                    .
                  </p>
                ) : null}

                <Form.Item className="!mb-0 !mt-1">
                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={resetPassword.isPending}
                    disabled={Boolean(tokenFromUrl) && !emailFromUrl}
                    className="erp-login-submit"
                  >
                    {resetPassword.isPending
                      ? labels.submitting
                      : labels.submit}
                  </Button>
                </Form.Item>
              </Form>

              <p className="erp-login-forgot">
                <Link href="/login" className="erp-login-forgot-link">
                  {labels.backToSignIn}
                </Link>
              </p>
            </section>
          </div>
        </main>

        <LoginFooter />
      </div>

      <LoginBrandPanel />
    </div>
  );
}

export default function ResetPasswordPage(): React.ReactNode {
  return (
    <Suspense
      fallback={
        <div className="erp-login-fallback">
          <Spin />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
