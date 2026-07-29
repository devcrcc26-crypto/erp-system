'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Form, Input, Spin } from 'antd';
import Card from '@/components/ui/Card/Card';
import { DemoLoginCredentials } from '@/components/auth/DemoLoginCredentials';
import { useLogin, useResendActivation } from '@/lib/query/auth';
import { signOutLocally, completeLocalSignIn } from '@/lib/auth/sign-out-locally';
import { useAuthStore } from '@/stores/auth.store';
import { ApiRequestError } from '@/lib/api/errors';

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
      const tokens = await login.mutateAsync(values);
      setAuth(tokens);
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
    <div className="flex w-full max-w-5xl flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-center">
      <Card
        className="w-full min-w-0 shadow-sm lg:max-w-md"
        styles={{ body: { padding: 0 } }}
        style={{ borderRadius: 6 }}
      >
        <div className="p-5 sm:p-8">
          <div className="mb-6 text-center sm:mb-8">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              CCECC
            </h1>
            <p className="mt-2 text-sm text-slate-500">Sign in to your account</p>
          </div>

          <Form<LoginFormValues>
            form={form}
            layout="vertical"
            requiredMark={false}
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
                placeholder="pm@company.local"
                autoComplete="email"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label={
                <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span>Password</span>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-orange-600 hover:underline"
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
              <Input.Password autoComplete="current-password" size="large" />
            </Form.Item>

            {hasExplicitLoginIntent && (
              <Alert
                type="warning"
                showIcon
                className="!mb-4"
                title="Sign in with the account you just updated. Any previous session in this browser has been cleared."
              />
            )}

            {infoMessage && (
              <Alert type="success" showIcon className="!mb-4" title={infoMessage} />
            )}

            {errorMessage && (
              <Alert type="error" showIcon className="!mb-4" title={errorMessage} />
            )}

            {showResendActivation && (
              <Button
                block
                className="!mb-4"
                onClick={() => void handleResendActivation()}
                loading={resendActivation.isPending}
              >
                Resend activation email
              </Button>
            )}

            <Form.Item className="!mb-0">
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={login.isPending}
              >
                {login.isPending ? 'Signing in...' : 'Sign in'}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Card>

      <DemoLoginCredentials onSelectAccount={handleSelectDemoAccount} />
    </div>
  );
}

export default function LoginPage(): React.ReactNode {
  return (
    <Suspense
      fallback={
        <Card
          className="w-full max-w-md text-center shadow-sm"
          style={{ borderRadius: 6 }}
        >
          <Spin />
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
