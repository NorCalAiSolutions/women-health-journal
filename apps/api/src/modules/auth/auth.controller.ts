import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { parseZod } from "../../common/parse-zod";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { AuthService } from "./auth.service";
import {
  LoginSchema,
  RegisterSchema,
  RequestPasswordResetSchema,
  ResetPasswordSchema,
  VerifyEmailSchema
} from "./auth.schemas";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() body: unknown) {
    return this.auth.register(parseZod(RegisterSchema, body));
  }

  @Post("login")
  login(@Body() body: unknown) {
    return this.auth.login(parseZod(LoginSchema, body));
  }

  @Post("verify-email")
  verifyEmail(@Body() body: unknown) {
    return this.auth.verifyEmail(parseZod(VerifyEmailSchema, body));
  }

  @Post("request-password-reset")
  requestPasswordReset(@Body() body: unknown) {
    return this.auth.requestPasswordReset(parseZod(RequestPasswordResetSchema, body));
  }

  @Post("reset-password")
  resetPassword(@Body() body: unknown) {
    return this.auth.resetPassword(parseZod(ResetPasswordSchema, body));
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser("sub") userId: string) {
    return this.auth.me(userId);
  }
}
