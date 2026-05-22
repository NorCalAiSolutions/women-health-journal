import { Body, Controller, Delete, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuditService } from "../../common/audit.service";
import { parseZod } from "../../common/parse-zod";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { AuthService } from "./auth.service";
import {
  AcceptPolicyConsentsSchema,
  LoginSchema,
  RegisterSchema,
  RequestPasswordResetSchema,
  ResetPasswordSchema,
  VerifyEmailSchema
} from "./auth.schemas";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService
  ) {}

  @Post("register")
  register(@Body() body: unknown, @Req() req: Request) {
    return this.auth.register(parseZod(RegisterSchema, body), this.audit.contextFromRequest(req));
  }

  @Post("login")
  login(@Body() body: unknown, @Req() req: Request) {
    return this.auth.login(parseZod(LoginSchema, body), this.audit.contextFromRequest(req));
  }

  @Post("verify-email")
  verifyEmail(@Body() body: unknown, @Req() req: Request) {
    return this.auth.verifyEmail(parseZod(VerifyEmailSchema, body), this.audit.contextFromRequest(req));
  }

  @Post("request-password-reset")
  requestPasswordReset(@Body() body: unknown, @Req() req: Request) {
    return this.auth.requestPasswordReset(parseZod(RequestPasswordResetSchema, body), this.audit.contextFromRequest(req));
  }

  @Post("reset-password")
  resetPassword(@Body() body: unknown, @Req() req: Request) {
    return this.auth.resetPassword(parseZod(ResetPasswordSchema, body), this.audit.contextFromRequest(req));
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser("sub") userId: string) {
    return this.auth.me(userId);
  }

  @Get("consent-status")
  @UseGuards(JwtAuthGuard)
  consentStatus(@CurrentUser("sub") userId: string) {
    return this.auth.policyConsentStatus(userId);
  }

  @Post("consents/policy")
  @UseGuards(JwtAuthGuard)
  acceptPolicyConsents(@CurrentUser("sub") userId: string, @Body() body: unknown, @Req() req: Request) {
    return this.auth.acceptPolicyConsents(userId, parseZod(AcceptPolicyConsentsSchema, body), this.audit.contextFromRequest(req));
  }

  @Get("account-export")
  @UseGuards(JwtAuthGuard)
  accountExport(@CurrentUser("sub") userId: string, @Req() req: Request) {
    return this.auth.exportAccount(userId, this.audit.contextFromRequest(req));
  }

  @Delete("account")
  @UseGuards(JwtAuthGuard)
  deleteAccount(@CurrentUser("sub") userId: string, @Req() req: Request) {
    return this.auth.deleteAccount(userId, this.audit.contextFromRequest(req));
  }
}
