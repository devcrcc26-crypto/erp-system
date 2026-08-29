'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Form, Input, Spin } from 'antd';
import { DemoLoginCredentials } from '@/components/auth/DemoLoginCredentials';
import { useLogin, useResendActivation } from '@/lib/query/auth';
import { signOutLocally, completeLocalSignIn } from '@/lib/auth/sign-out-locally';
import { useAuthStore } from '@/stores/auth.store';
import { ApiRequestError } from '@/lib/api/errors';
import { tokens } from '@/lib/theme/tokens';

interface LoginFormValues {
  email: string;
  password: string;
}

function LoginForm(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();
  const resendActivation = useResendActivation();
  const [form] = Form.useForm<LoginFormValues>();
  const setAuth = useAuthStore((state) => state.setAuth);

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
    form.setFieldsValue({ email, password });
    setErrorMessage(null);
    setInfoMessage(null);
  }

  async function handleSubmit(values: LoginFormValues): Promise<void> {
    setErrorMessage(null);
    setInfoMessage(null);
    setShowResendActivation(false);

    try {
      const tokensResponse = await login.mutateAsync(values);
      setAuth(tokensResponse);
      completeLocalSignIn();
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
    const email = form.getFieldValue('email');
    if (!email) {
      setErrorMessage('Enter your email address first.');
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const result = await resendActivation.mutateAsync({ email });
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
    <div className="erp-login-page relative flex min-h-dvh w-full overflow-hidden">
      {/* Brand plane */}
      <aside
        className="relative hidden w-[52%] flex-col justify-between overflow-hidden px-10 py-10 xl:px-14 xl:py-12 lg:flex"
        style={{ backgroundColor: tokens.colorNavy }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: `
              linear-gradient(135deg, transparent 0%, rgba(29,158,117,0.35) 100%),
              repeating-linear-gradient(
                -18deg,
                transparent,
                transparent 42px,
                rgba(255,255,255,0.04) 42px,
                rgba(255,255,255,0.04) 43px
              )
            `,
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-30"
          style={{
            background:
              'radial-gradient(circle, rgba(29,158,117,0.55) 0%, transparent 70%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 left-10 h-96 w-96 rounded-full opacity-20"
          style={{
            background:
              'radial-gradient(circle, rgba(55,138,221,0.45) 0%, transparent 68%)',
          }}
          aria-hidden
        />

        <div className="erp-login-brand-enter relative z-[1] flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-none bg-white p-1.5">
            <Image
              src="/ccecc-logo.png"
              alt=""
              width={48}
              height={48}
              className="object-contain"
              priority
            />
          </div>
          <span
            className="text-[15px] font-semibold tracking-[0.18em] text-white"
            style={{ fontFamily: tokens.fontFamily }}
          >
            CCECC
          </span>
        </div>

        <div className="erp-login-brand-enter relative z-[1] max-w-lg delay-100">
          <h1
            className="m-0 text-[2.75rem] font-semibold leading-[1.1] tracking-[-0.02em] text-white xl:text-[3.25rem]"
            style={{ fontFamily: tokens.fontFamily }}
          >
            Construction ERP
          </h1>
        </div>

        <p className="erp-login-brand-enter relative z-[1] text-xs text-white/40 delay-200">
          © {new Date().getFullYear()} China Civil Engineering Construction
          Corporation
        </p>
      </aside>

      {/* Sign-in panel */}
      <main className="relative flex w-full flex-1 flex-col bg-white lg:w-[48%]">
        <div className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-10 lg:px-12 xl:px-16">
          <div className="erp-login-form-enter mx-auto w-full max-w-[400px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <Image
                src="/ccecc-logo.png"
                alt="CCECC"
                width={44}
                height={44}
                className="object-contain"
                priority
              />
              <div>
                <p className="m-0 text-sm font-semibold tracking-wide text-slate-900">
                  CCECC
                </p>
                <p className="m-0 text-xs text-slate-500">Construction ERP</p>
              </div>
            </div>

            <h2
              className="m-0 text-[1.65rem] font-semibold tracking-[-0.02em] text-slate-900"
              style={{ fontFamily: tokens.fontFamily }}
            >
              Sign in
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Use your company email and password to continue.
            </p>

            <Form<LoginFormValues>
              form={form}
              layout="vertical"
              requiredMark={false}
              className="mt-8"
              onFinish={(values: LoginFormValues) => void handleSubmit(values)}
            >
              <Form.Item
                label="Email"
                name="email"
                rules={[
                  { required: true, message: 'Email is required' },
                  { type: 'email', message: 'Enter a valid email' },
                ]}
              >
                <Input
                  placeholder="name@company.com"
                  autoComplete="email"
                  size="large"
                  style={{ borderRadius: 0 }}
                />
              </Form.Item>

              <Form.Item
                label={
                  <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span>Password</span>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium hover:underline"
                      style={{ color: tokens.colorPrimary }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                }
                name="password"
                rules={[
                  { required: true, message: 'Password is required' },
                  { min: 8, message: 'Password must be at least 8 characters' },
                ]}
              >
                <Input.Password
                  autoComplete="current-password"
                  size="large"
                  style={{ borderRadius: 0 }}
                />
              </Form.Item>

              {hasExplicitLoginIntent ? (
                <Alert
                  type="warning"
                  showIcon
                  className="!mb-4"
                  style={{ borderRadius: 0 }}
                  title="Sign in with the account you just updated. Any previous session in this browser has been cleared."
                />
              ) : null}

              {infoMessage ? (
                <Alert
                  type="success"
                  showIcon
                  className="!mb-4"
                  style={{ borderRadius: 0 }}
                  title={infoMessage}
                />
              ) : null}

              {errorMessage ? (
                <Alert
                  type="error"
                  showIcon
                  className="!mb-4"
                  style={{ borderRadius: 0 }}
                  title={errorMessage}
                />
              ) : null}

              {showResendActivation ? (
                <Button
                  block
                  className="!mb-4"
                  style={{ borderRadius: 0 }}
                  onClick={() => void handleResendActivation()}
                  loading={resendActivation.isPending}
                >
                  Resend activation email
                </Button>
              ) : null}

              <Form.Item className="!mb-0">
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={login.isPending}
                  style={{ borderRadius: 0, height: 44 }}
                >
                  {login.isPending ? 'Signing in…' : 'Sign in'}
                </Button>
              </Form.Item>
            </Form>

            <div className="mt-8 border-t border-slate-100 pt-5">
              <DemoLoginCredentials onSelectAccount={handleSelectDemoAccount} />
            </div>
          </div>
        </div>

        <footer className="px-5 pb-6 text-center text-[11px] text-slate-400 sm:px-10 lg:hidden">
          © {new Date().getFullYear()} CCECC
        </footer>
      </main>
    </div>
  );
}

export default function LoginPage(): React.ReactNode {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-white">
          <Spin size="large" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
