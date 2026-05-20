import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  async sendVerificationCode(to: string, code: string) {
    return this.send({
      to,
      subject: "Verify your Women's Health Journal Companion account",
      text: `Your verification code is ${code}. It expires in 24 hours.`,
      html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 24 hours.</p>`
    });
  }

  async sendPasswordResetCode(to: string, code: string) {
    return this.send({
      to,
      subject: "Reset your Women's Health Journal Companion password",
      text: `Your password reset code is ${code}. It expires in 30 minutes.`,
      html: `<p>Your password reset code is <strong>${code}</strong>.</p><p>It expires in 30 minutes.</p>`
    });
  }

  private async send(message: EmailMessage) {
    if (!this.isConfigured()) {
      const detail = "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_FROM, and credentials if required.";
      if (process.env.NODE_ENV === "production") {
        throw new InternalServerErrorException(detail);
      }
      this.logger.warn(`${detail} Dev response will include the code.`);
      return false;
    }

    await this.getTransporter().sendMail({
      from: this.config.get<string>("SMTP_FROM"),
      ...message
    });
    return true;
  }

  private getTransporter() {
    if (!this.transporter) {
      const user = this.config.get<string>("SMTP_USER");
      const pass = this.config.get<string>("SMTP_PASS");
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>("SMTP_HOST"),
        port: Number(this.config.get<string>("SMTP_PORT") ?? 587),
        secure: this.config.get<string>("SMTP_SECURE") === "true",
        auth: user && pass ? { user, pass } : undefined
      });
    }
    return this.transporter;
  }

  private isConfigured() {
    return Boolean(
      this.config.get<string>("SMTP_HOST") &&
        this.config.get<string>("SMTP_PORT") &&
        this.config.get<string>("SMTP_FROM")
    );
  }
}
