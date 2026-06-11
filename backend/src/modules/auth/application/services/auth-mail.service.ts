import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly frontendUrl: string;
  private readonly mailEnabled: boolean;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      'http://localhost:3000';
    this.mailEnabled = Boolean(this.configService.get<string>('MAIL_HOST'));
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

    if (!this.mailEnabled) {
      this.logger.debug(`Activation link for ${email}: ${url}`);
      return;
    }

    await this.mailerService.sendMail({
      to: email,
      subject: 'Activate your Construction ERP account',
      html: this.renderActivationBody(firstName, url),
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

    if (!this.mailEnabled) {
      this.logger.debug(`Password reset link for ${email}: ${url}`);
      return;
    }

    await this.mailerService.sendMail({
      to: email,
      subject: 'Reset your Construction ERP password',
      html: this.renderPasswordResetBody(url),
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

    if (!this.mailEnabled) {
      this.logger.debug(`Email change confirmation for ${email}: ${url}`);
      return;
    }

    await this.mailerService.sendMail({
      to: email,
      subject: 'Confirm your new email address',
      html: this.renderEmailChangeBody(url),
    });
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
