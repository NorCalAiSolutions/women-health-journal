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

  async sendContactRequest(message: {
    type: "contact" | "demo";
    name: string;
    email: string;
    organization?: string;
    message: string;
  }) {
    const label = message.type === "demo" ? "Demo Request" : "Contact Request";
    const to = this.config.get<string>("CONTACT_TO") ?? "akhil100@gmail.com";
    return this.send({
      to,
      subject: `${label}: ${message.name}`,
      text: [
        `${label}`,
        "",
        `Name: ${message.name}`,
        `Email: ${message.email}`,
        `Organization: ${message.organization || "Not provided"}`,
        "",
        message.message
      ].join("\n"),
      html: [
        `<h2>${this.escapeHtml(label)}</h2>`,
        `<p><strong>Name:</strong> ${this.escapeHtml(message.name)}</p>`,
        `<p><strong>Email:</strong> ${this.escapeHtml(message.email)}</p>`,
        `<p><strong>Organization:</strong> ${this.escapeHtml(message.organization || "Not provided")}</p>`,
        `<p><strong>Message:</strong></p>`,
        `<p>${this.escapeHtml(message.message).replace(/\n/g, "<br />")}</p>`
      ].join("")
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

    try {
      await this.getTransporter().sendMail({
        from: this.config.get<string>("SMTP_FROM"),
        ...message
      });
      return true;
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw error;
      }
      const messageText = error instanceof Error ? error.message : "Unknown email delivery error.";
      this.logger.warn(`Email delivery failed in development: ${messageText}. Dev response will include the code.`);
      return false;
    }
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

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
