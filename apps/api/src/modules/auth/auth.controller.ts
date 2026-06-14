import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuditService } from "../../common/audit.service";
import { parseZod } from "../../common/parse-zod";
import { AllowPasswordChange } from "./allow-password-change.decorator";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { Roles } from "./roles.decorator";
import { AuthService } from "./auth.service";
import {
  AcceptPolicyConsentsSchema,
  AdminCreateUserSchema,
  AdminResetPasswordSchema,
  ChangePasswordSchema,
  LoginSchema,
} from "./auth.schemas";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService
  ) {}

  @Post("login")
  login(@Body() body: unknown, @Req() req: Request) {
    return this.auth.login(parseZod(LoginSchema, body), this.audit.contextFromRequest(req));
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChange()
  changePassword(@CurrentUser("sub") userId: string, @Body() body: unknown, @Req() req: Request) {
    return this.auth.changePassword(userId, parseZod(ChangePasswordSchema.omit({ userId: true }), body), this.audit.contextFromRequest(req));
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChange()
  me(@CurrentUser("sub") userId: string) {
    return this.auth.me(userId);
  }

  @Get("admin/users")
  @UseGuards(JwtAuthGuard)
  @Roles("admin")
  adminUsers() {
    return this.auth.listUsers();
  }

  @Post("admin/users")
  @UseGuards(JwtAuthGuard)
  @Roles("admin")
  adminCreateUser(@Body() body: unknown, @Req() req: Request) {
    return this.auth.adminCreateUser(parseZod(AdminCreateUserSchema, body), this.audit.contextFromRequest(req));
  }

  @Post("admin/users/:id/reset-password")
  @UseGuards(JwtAuthGuard)
  @Roles("admin")
  adminResetPassword(@Param("id") id: string, @Body() body: unknown, @Req() req: Request) {
    return this.auth.adminResetPassword(id, parseZod(AdminResetPasswordSchema, body), this.audit.contextFromRequest(req));
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
