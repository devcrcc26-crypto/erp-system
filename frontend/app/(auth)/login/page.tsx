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
    <div className="erp-login-page flex min-h-dvh w-full flex-col bg-white">
      <header
        className="flex h-14 shrink-0 items-center border-b border-[rgba(0,0,0,0.08)] px-5 sm:px-8"
      >
        <div className="flex items-center gap-3">
          <Image
            src="/ccecc-logo.png"
            alt="CCECC"
            width={32}
            height={32}
            className="object-contain"
            priority
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span
              className="text-[13px] font-semibold tracking-wide text-slate-900"
              style={{ fontFamily: tokens.fontFamily }}
            >
              CCECC
            </span>
            <span className="text-[11px] text-slate-500">Construction ERP</span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[380px]">
          <h1
            className="m-0 text-[1.5rem] font-semibold tracking-[-0.02em] text-slate-900"
            style={{ fontFamily: tokens.fontFamily }}
          >
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your email and password
          </p>

          <Form<LoginFormValues>
            form={form}
            layout="vertical"
            requiredMark={false}
            className="erp-login-form mt-8"
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
              />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[
                { required: true, message: 'Password is required' },
                { min: 8, message: 'Password must be at least 8 characters' },
              ]}
            >
              <Input.Password autoComplete="current-password" size="large" />
            </Form.Item>

            {hasExplicitLoginIntent ? (
              <Alert
                type="warning"
                showIcon
                className="!mb-4"
                title="Sign in with the account you just updated. Any previous session in this browser has been cleared."
              />
            ) : null}

            {infoMessage ? (
              <Alert
                type="success"
                showIcon
                className="!mb-4"
                title={infoMessage}
              />
            ) : null}

            {errorMessage ? (
              <Alert
                type="error"
                showIcon
                className="!mb-4"
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

          <p className="mt-4 text-center">
            <Link
              href="/forgot-password"
              className="text-sm font-medium hover:underline"
              style={{ color: tokens.colorPrimary }}
            >
              Forgot password?
            </Link>
          </p>

          <div className="mt-10 border-t border-[rgba(0,0,0,0.06)] pt-5">
            <DemoLoginCredentials onSelectAccount={handleSelectDemoAccount} />
          </div>
        </div>
      </main>

      <footer className="shrink-0 border-t border-[rgba(0,0,0,0.06)] px-5 py-4 text-center text-[11px] text-slate-400 sm:px-8">
        © {new Date().getFullYear()} CCECC
      </footer>
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
