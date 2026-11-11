'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Form, Input } from 'antd';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { ApiRequestError } from '@/lib/api/errors';
import {
  clearPendingTemporaryPassword,
  peekPendingTemporaryPassword,
} from '@/lib/auth/pending-temporary-password';
import { useChangePassword } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/theme/tokens';

interface FormValues {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ForceChangePasswordPage(): React.ReactNode {
  const router = useRouter();
  const changePassword = useChangePassword();
  const updateUser = useAuthStore((s) => s.updateUser);
  const loginName = useAuthStore((s) => s.user?.loginName);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // The temporary password just used to sign in (memory only). While we have
  // it, the user is not asked to type it again.
  const [signInPassword, setSignInPassword] = useState<string | null>(() =>
    peekPendingTemporaryPassword(),
  );

  async function handleSubmit(values: FormValues): Promise<void> {
    setErrorMessage(null);
    if (values.newPassword !== values.confirmPassword) {
      setErrorMessage('New passwords do not match');
      return;
    }
    if (
      loginName &&
      values.newPassword.trim().toLowerCase() === loginName.trim().toLowerCase()
    ) {
      setErrorMessage('Password must not equal the login name');
      return;
    }

    try {
      await changePassword.mutateAsync({
        currentPassword: signInPassword ?? values.currentPassword ?? '',
        newPassword: values.newPassword,
      });
      clearPendingTemporaryPassword();
      updateUser({ mustChangePassword: false });
      router.replace('/');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
        if (signInPassword && /current password/i.test(error.message)) {
          // Fall back to asking for it explicitly.
          clearPendingTemporaryPassword();
          setSignInPassword(null);
        }
      } else {
        setErrorMessage('Could not change password. Please try again.');
      }
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-10">
      <h1
        className="m-0 text-xl font-semibold text-slate-900"
        style={{ fontFamily: tokens.fontFamily }}
      >
        Change password
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        You must set a new password before continuing.
      </p>

      <Form<FormValues>
        layout="vertical"
        className="mt-6"
        onFinish={(values) => void handleSubmit(values)}
      >
        {signInPassword ? null : (
          <Form.Item
            label="Current temporary password"
            name="currentPassword"
            extra="The temporary password HR gave you (the one you just signed in with)."
            rules={[{ required: true, message: 'Required' }]}
          >
            {/* No autofill: a saved password for another account was being filled in here. */}
            <Input.Password autoComplete="off" size="large" />
          </Form.Item>
        )}
        <Form.Item
          label="New password"
          name="newPassword"
          rules={[
            { required: true, message: 'Required' },
            { min: 8, message: 'At least 8 characters' },
          ]}
        >
          <Input.Password autoComplete="new-password" size="large" />
        </Form.Item>
        <Form.Item
          label="Confirm new password"
          name="confirmPassword"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input.Password autoComplete="new-password" size="large" />
        </Form.Item>

        {errorMessage ? (
          <ErpNotice tone="error" className="mb-4" title={errorMessage} />
        ) : null}

        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={changePassword.isPending}
        >
          Save new password
        </Button>
      </Form>
    </div>
  );
}
