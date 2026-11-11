'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Form, Input, Spin } from 'antd';
import { DemoLoginPanel } from '@/components/auth/DemoLoginPanel';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { isDemoLoginEnabled } from '@/lib/auth/demo-login-enabled';
import { setPendingTemporaryPassword } from '@/lib/auth/pending-temporary-password';
import { useLogin, useResendActivation } from '@/lib/query/auth';
import { signOutLocally, completeLocalSignIn } from '@/lib/auth/sign-out-locally';
import { useAuthStore } from '@/stores/auth.store';
import { ApiRequestError } from '@/lib/api/errors';
import { tokens } from '@/lib/theme/tokens';

interface LoginFormValues {
  identifier: string;
  password: string;
}

function useLoginLabels(): {
  fullName: string;
  subtitle: string;
  brandLine: string;
} {
  return useMemo(() => {
    const lang =
      typeof document !== 'undefined'
        ? document.documentElement.lang || navigator.language
        : 'en';
    const isZh = lang.toLowerCase().startsWith('zh');
    return {
      fullName: isZh ? '姓名' : 'Full name',
      subtitle: isZh
        ? '请输入姓名和密码以继续'
        : 'Enter your full name and password to continue',
      brandLine: isZh
        ? '建设企业的统一工作平台'
        : 'One workspace for construction operations',
    };
  }, []);
}

function LoginForm(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();
  const resendActivation = useResendActivation();
  const [form] = Form.useForm<LoginFormValues>();
  const identifierValue = Form.useWatch('identifier', form) ?? '';
  const identifierTrimmed = identifierValue.trim();
  /** Full-name login (no @) → staff without email; hide self-serve reset. */
  const showForgotPassword =
    !identifierTrimmed || identifierTrimmed.includes('@');
  const setAuth = useAuthStore((state) => state.setAuth);
  const labels = useLoginLabels();

  const activated = searchParams.get('activated') === '1';
  const reset = searchParams.get('reset') === '1';
  const emailChanged = searchParams.get('emailChanged') === '1';
  const hasExplicitLoginIntent = activated || reset || emailChanged;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(() => {
    if (searchParams.get('activated') === '1') {
      return 'Your account is ready. Sign in with your new password.';
    }
    if (searchParams.get('reset') === '1') {
      return 'Password reset successfully. Sign in with your new password.';
    }
    if (searchParams.get('emailChanged') === '1') {
      return 'Your email address was updated. Sign in with your new email.';
    }
    return null;
  });
  const [showResendActivation, setShowResendActivation] = useState(false);

  useEffect(() => {
    if (hasExplicitLoginIntent) {
      signOutLocally();
    }
  }, [hasExplicitLoginIntent]);

  function handleSelectDemoAccount(email: string, password: string): void {
    form.setFieldsValue({ identifier: email, password });
    setErrorMessage(null);
    setInfoMessage(null);
  }

  async function handleSubmit(values: LoginFormValues): Promise<void> {
    setErrorMessage(null);
    setInfoMessage(null);
    setShowResendActivation(false);

    try {
      const tokensResponse = await login.mutateAsync({
        identifier: values.identifier,
        password: values.password,
      });
      setAuth(tokensResponse);
      completeLocalSignIn();
      if (tokensResponse.user.mustChangePassword) {
        setPendingTemporaryPassword(values.password);
        router.replace('/change-password');
        return;
      }
      const redirectTo = searchParams.get('from') ?? '/';
      router.replace(redirectTo);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
        if (error.code === 'EMAIL_NOT_VERIFIED') {
          setShowResendActivation(true);
        }
      } else {
        setErrorMessage('Login failed. Please try again.');
      }
    }
  }

  async function handleResendActivation(): Promise<void> {
    const identifier = form.getFieldValue('identifier') as string | undefined;
    if (!identifier?.includes('@')) {
      setErrorMessage('Enter your email address first.');
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const result = await resendActivation.mutateAsync({ email: identifier });
      setInfoMessage(result.message);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Could not resend activation email.');
      }
    }
  }

  return (
    <div className="erp-login-page">
      <aside className="erp-login-brand" aria-label="CCECC">
        <div className="erp-login-brand-glow" aria-hidden />
        <div className="erp-login-brand-grid" aria-hidden />
        <div className="erp-login-brand-inner">
          <div className="erp-login-brand-mark">
            <span className="erp-login-logo-chip erp-login-logo-chip--hero">
              <Image
                src="/ccecc-logo.png"
                alt=""
                width={48}
                height={48}
                className="h-auto w-auto max-h-12 max-w-12 object-contain"
                priority
                suppressHydrationWarning
              />
            </span>
            <p className="erp-login-brand-name">CCECC</p>
          </div>
          <h1 className="erp-login-brand-title">Construction ERP</h1>
          <p className="erp-login-brand-line">{labels.brandLine}</p>
        </div>
        <p className="erp-login-brand-foot">
          © {new Date().getFullYear()} China Civil Engineering Construction
          Corporation
        </p>
      </aside>

      <div className="erp-login-stage">
        <header className="erp-login-stage-header">
          <span className="erp-login-logo-chip erp-login-logo-chip--compact">
            <Image
              src="/ccecc-logo.png"
              alt="CCECC"
              width={28}
              height={28}
              className="h-auto w-auto max-h-7 max-w-7 object-contain"
              priority
              suppressHydrationWarning
            />
          </span>
          <div className="erp-login-stage-brand-text">
            <span className="erp-login-stage-name">CCECC</span>
            <span className="erp-login-stage-product">Construction ERP</span>
          </div>
        </header>

        <main className="erp-login-main">
          <div className="erp-login-layout">
            <div className="erp-login-card">
              <div className="erp-login-card-body">
                <p className="erp-login-eyebrow">Welcome back</p>
                <h2
                  className="erp-login-heading"
                  style={{ fontFamily: tokens.fontFamily }}
                >
                  Sign in
                </h2>
                <p className="erp-login-subtitle">{labels.subtitle}</p>

                <Form<LoginFormValues>
                  form={form}
                  layout="vertical"
                  requiredMark={false}
                  className="erp-login-form"
                  onFinish={(values: LoginFormValues) => void handleSubmit(values)}
                >
                  <Form.Item
                    label={labels.fullName}
                    name="identifier"
                    rules={[
                      {
                        required: true,
                        message: `${labels.fullName} is required`,
                      },
                    ]}
                  >
                    <Input
                      placeholder={labels.fullName}
                      autoComplete="username"
                      size="large"
                    />
                  </Form.Item>

                  <Form.Item
                    label="Password"
                    name="password"
                    rules={[
                      { required: true, message: 'Password is required' },
                      {
                        min: 8,
                        message: 'Password must be at least 8 characters',
                      },
                    ]}
                  >
                    <Input.Password
                      autoComplete="current-password"
                      size="large"
                    />
                  </Form.Item>

                  {hasExplicitLoginIntent ? (
                    <ErpNotice
                      tone="warning"
                      className="mb-4"
                      title="Sign in with the account you just updated. Any previous session in this browser has been cleared."
                    />
                  ) : null}

                  {infoMessage ? (
                    <ErpNotice
                      tone="success"
                      className="mb-4"
                      title={infoMessage}
                    />
                  ) : null}

                  {errorMessage ? (
                    <ErpNotice
                      tone="error"
                      className="mb-4"
                      title={errorMessage}
                    />
                  ) : null}

                  {showResendActivation ? (
                    <Button
                      block
                      className="!mb-4"
                      onClick={() => void handleResendActivation()}
                      loading={resendActivation.isPending}
                    >
                      Resend activation email
                    </Button>
                  ) : null}

                  <Form.Item className="!mb-0 !mt-1">
                    <Button
                      type="primary"
                      htmlType="submit"
                      block
                      size="large"
                      loading={login.isPending}
                      className="erp-login-submit"
                    >
                      {login.isPending ? 'Signing in…' : 'Sign in'}
                    </Button>
                  </Form.Item>
                </Form>

                {showForgotPassword ? (
                  <p className="erp-login-forgot">
                    <Link
                      href={
                        identifierTrimmed.includes('@')
                          ? `/forgot-password?email=${encodeURIComponent(identifierTrimmed)}`
                          : '/forgot-password'
                      }
                      className="erp-login-forgot-link"
                      style={{ color: tokens.colorPrimary }}
                    >
                      Forgot password?
                    </Link>
                  </p>
                ) : (
                  <p className="erp-login-help">
                    No email on your account? Ask HR to reset your password.
                  </p>
                )}
              </div>
            </div>

            {isDemoLoginEnabled() ? (
              <aside className="erp-login-demo-panel" aria-label="Demo access">
                <DemoLoginPanel onSelectAccount={handleSelectDemoAccount} />
              </aside>
            ) : null}
          </div>
        </main>

        <footer className="erp-login-footer">
          © {new Date().getFullYear()} CCECC · Construction ERP
        </footer>
      </div>
    </div>
  );
}

export default function LoginPage(): React.ReactNode {
  return (
    <Suspense
      fallback={
        <div className="erp-login-fallback">
          <Spin />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
