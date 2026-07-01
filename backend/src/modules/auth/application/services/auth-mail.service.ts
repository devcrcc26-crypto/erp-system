import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResendEmailService } from '../../../../shared/mail/resend-email.service';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly frontendUrl: string;
  private readonly mailEnabled: boolean;
  private readonly isDevelopment: boolean;

  constructor(
    private readonly resendEmailService: ResendEmailService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      'http://localhost:3000';
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY') ?? '';
    const mailHost = this.configService.get<string>('MAIL_HOST') ?? '';
    this.mailEnabled = Boolean(resendApiKey || mailHost);
    this.isDevelopment =
      this.configService.get<string>('NODE_ENV') === 'development';
  }

  /**
   * Sends account activation email with a link to set password and verify email.
   */
  async sendActivationEmail(
    email: string,
    token: string,
    firstName: string,
  ): Promise<void> {
    const url = this.buildUrl('/activate', { token });
    this.logDevAuthLink('Activation', email, url);

    if (!this.mailEnabled) {
      return;
    }

    await this.deliverMail({
      to: email,
      subject: 'Activate your Construction ERP account',
      html: this.renderActivationBody(firstName, url),
      fallbackUrl: url,
    });
  }

  /**
   * Sends password reset email with a one-time reset link.
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const url = this.buildUrl('/reset-password', {
      token,
      email,
    });
    this.logDevAuthLink('Password reset', email, url);

    if (!this.mailEnabled) {
      return;
    }

    await this.deliverMail({
      to: email,
      subject: 'Reset your Construction ERP password',
      html: this.renderPasswordResetBody(url),
      fallbackUrl: url,
    });
  }

  /**
   * Sends email-change confirmation to the new address.
   */
  async sendEmailChangeConfirmation(
    email: string,
    token: string,
  ): Promise<void> {
    const url = this.buildUrl('/confirm-email-change', { token });
    this.logDevAuthLink('Email change', email, url);

    if (!this.mailEnabled) {
      return;
    }

    await this.deliverMail({
      to: email,
      subject: 'Confirm your new email address',
      html: this.renderEmailChangeBody(url),
      fallbackUrl: url,
    });
  }

  /**
   * Attempts delivery via Resend or SMTP; logs the link in development on failure.
   */
  private async deliverMail(input: {
    to: string;
    subject: string;
    html: string;
    fallbackUrl: string;
  }): Promise<void> {
    try {
      await this.resendEmailService.send({
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to send email to ${input.to} (${reason}). Use this link: ${input.fallbackUrl}`,
      );
    }
  }

  private logDevAuthLink(
    kind: string,
    email: string,
    url: string,
  ): void {
    if (!this.isDevelopment) {
      return;
    }

    this.logger.log(`[DEV ${kind}] ${email} → ${url}`);
  }

  private buildUrl(
    path: string,
    params: Record<string, string>,
  ): string {
    const url = new URL(path, this.frontendUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private renderActivationBody(firstName: string, url: string): string {
    return `
      <p>Hello ${this.escapeHtml(firstName)},</p>
      <p>Your account has been created. Click the link below to verify your email and set your password:</p>
      <p><a href="${url}">Activate your account</a></p>
      <p>This link expires in 24 hours. If you did not expect this email, you can ignore it.</p>
    `;
  }

  private renderPasswordResetBody(url: string): string {
    return `
      <p>You requested a password reset for your Construction ERP account.</p>
      <p><a href="${url}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
    `;
  }

  private renderEmailChangeBody(url: string): string {
    return `
      <p>Confirm your new email address for your Construction ERP account.</p>
      <p><a href="${url}">Confirm email change</a></p>
      <p>If you did not request this change, contact your administrator.</p>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
