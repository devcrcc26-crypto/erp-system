'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Form, Input, Spin } from 'antd';
import Card from '@/components/ui/Card/Card';
import { useLogin, useResendActivation } from '@/lib/query/auth';
import { signOutLocally, completeLocalSignIn } from '@/lib/auth/sign-out-locally';
import { useAuthStore } from '@/stores/auth.store';
import { ApiRequestError } from '@/lib/api/errors';
import { DemoEmailWarning } from '@/components/auth/DemoEmailWarning';

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
  const watchedEmail = Form.useWatch('email', form) ?? '';

  useEffect(() => {
    if (hasExplicitLoginIntent) {
      signOutLocally();
    }
  }, [hasExplicitLoginIntent]);

  async function handleSubmit(values: LoginFormValues): Promise<void> {
    setErrorMessage(null);
    setInfoMessage(null);
    setShowResendActivation(false);

    try {
      const tokens = await login.mutateAsync(values);
      // Guarantee identity is in Zustand before navigation; the dashboard must
      // never mount with a stale or empty user. Capabilities load asynchronously
      // via SessionCapabilitiesSync after the token is present.
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
      setInfoMessage(
        `${result.message} In local development, check the backend terminal for the activation link.`,
      );
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Could not resend activation email.');
      }
    }
  }

  return (
    <Card
      className="w-full max-w-md shadow-sm"
      styles={{ body: { padding: 32 } }}
      style={{ borderRadius: 6 }}
    >
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">CCECC PWF</h1>
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
          <Input placeholder="admin@company.local" autoComplete="email" />
        </Form.Item>
        <DemoEmailWarning email={watchedEmail} />

        <Form.Item
          label={
            <div className="flex w-full items-center justify-between">
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
          <Input.Password autoComplete="current-password" />
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
          <Button type="primary" htmlType="submit" block loading={login.isPending}>
            {login.isPending ? 'Signing in...' : 'Sign in'}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

export default function LoginPage(): React.ReactNode {
  return (
    <Suspense
      fallback={
        <Card className="w-full max-w-md text-center shadow-sm" style={{ borderRadius: 6 }}>
          <Spin />
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
