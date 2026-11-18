'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Form, Input, Spin } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import BrandLogo from '@/components/ui/BrandLogo/BrandLogo';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { DemoEmailWarning } from '@/components/auth/DemoEmailWarning';
import { useForgotPassword } from '@/lib/query/auth';
import { ApiRequestError } from '@/lib/api/errors';

interface ForgotFormValues {
  email: string;
}

function useForgotPasswordLabels(): {
  heading: string;
  subtitle: string;
  brandLine: string;
  email: string;
  emailRequired: string;
  emailInvalid: string;
  submit: string;
  submitting: string;
  helpNoEmail: string;
  backToSignIn: string;
  successExtra: string;
  genericError: string;
} {
  return useMemo(() => {
    const lang =
      typeof document !== 'undefined'
        ? document.documentElement.lang || navigator.language
        : 'en';
    const isZh = lang.toLowerCase().startsWith('zh');
    return isZh
      ? {
          heading: '忘记密码',
          subtitle:
            '输入账户绑定的邮箱。若匹配，我们将发送重置链接。账户没有邮箱时，请联系 HR 重置密码。',
          brandLine: '项目管理、人力与财务，统一在一个工作区',
          email: '邮箱',
          emailRequired: '请输入邮箱',
          emailInvalid: '请输入有效的邮箱地址',
          submit: '发送重置链接',
          submitting: '发送中…',
          helpNoEmail: '账户没有邮箱？请联系 HR 重置密码。',
          backToSignIn: '返回登录',
          successExtra:
            '如果没有收到邮件，请核对邮箱地址，并确认账户仍处于在职状态。',
          genericError: '无法发送重置邮件，请重试。',
        }
      : {
          heading: 'Forgot password',
          subtitle:
            'Enter the email address on your account. We will send a reset link if it matches. If your account has no email, ask HR to reset your password.',
          brandLine: 'Projects, workforce and finance in one workspace',
          email: 'Email',
          emailRequired: 'Email is required',
          emailInvalid: 'Enter a valid email address',
          submit: 'Send reset link',
          submitting: 'Sending…',
          helpNoEmail: 'No email on your account? Ask HR to reset your password.',
          backToSignIn: 'Back to sign in',
          successExtra:
            'If you do not see an email, double-check the address and that the account is still active.',
          genericError: 'Could not send reset email. Please try again.',
        };
  }, []);
}

function ForgotPasswordForm(): React.ReactNode {
  const forgotPassword = useForgotPassword();
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get('email')?.trim() ?? '';
  const labels = useForgotPasswordLabels();
  const [form] = Form.useForm<ForgotFormValues>();
  const watchedEmail = Form.useWatch('email', form) ?? emailFromQuery;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(values: ForgotFormValues): Promise<void> {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await forgotPassword.mutateAsync({
        email: values.email.trim().toLowerCase(),
      });
      setSuccessMessage(`${result.message} ${labels.successExtra}`);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(labels.genericError);
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
              aria-labelledby="erp-forgot-password-heading"
            >
              <header className="erp-login-panel-head">
                <h1
                  id="erp-forgot-password-heading"
                  className="erp-login-heading"
                >
                  {labels.heading}
                </h1>
                <p className="erp-login-subtitle">{labels.subtitle}</p>
              </header>

              <Form<ForgotFormValues>
                form={form}
                layout="vertical"
                requiredMark={false}
                className="erp-login-form"
                initialValues={{ email: emailFromQuery }}
                onFinish={(values) => void handleSubmit(values)}
              >
                <Form.Item
                  label={labels.email}
                  name="email"
                  rules={[
                    { required: true, message: labels.emailRequired },
                    { type: 'email', message: labels.emailInvalid },
                  ]}
                >
                  <Input
                    prefix={<MailOutlined aria-hidden />}
                    type="email"
                    autoComplete="email"
                    size="large"
                    placeholder={labels.email}
                  />
                </Form.Item>

                <DemoEmailWarning email={watchedEmail} />

                {successMessage ? (
                  <ErpNotice
                    tone="success"
                    className="mb-4"
                    title={successMessage}
                  />
                ) : null}

                {errorMessage ? (
                  <ErpNotice
                    tone="error"
                    className="mb-4"
                    title={errorMessage}
                  />
                ) : null}

                <Form.Item className="!mb-0 !mt-1">
                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={forgotPassword.isPending}
                    className="erp-login-submit"
                  >
                    {forgotPassword.isPending
                      ? labels.submitting
                      : labels.submit}
                  </Button>
                </Form.Item>
              </Form>

              <p className="erp-login-help">{labels.helpNoEmail}</p>
              <p className="erp-login-forgot">
                <Link href="/login" className="erp-login-forgot-link">
                  {labels.backToSignIn}
                </Link>
              </p>
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
          <p className="erp-login-brand-title">{labels.brandLine}</p>
        </div>
      </aside>
    </div>
  );
}

export default function ForgotPasswordPage(): React.ReactNode {
  return (
    <Suspense
      fallback={
        <div className="erp-login-fallback">
          <Spin />
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
