import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { ALLOW_PASSWORD_CHANGE_KEY } from "./allow-password-change.decorator";
import { AuthUser } from "./current-user.decorator";
import { ROLES_KEY, UserRole } from "./roles.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    try {
      request.user = await this.jwt.verifyAsync<AuthUser>(token, {
        secret: process.env.JWT_SECRET ?? "development-only-secret"
      });
      const allowPasswordChange = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, [
        context.getHandler(),
        context.getClass()
      ]);
      if (request.user.mustChangePassword && !allowPasswordChange) {
        throw new ForbiddenException("Password change required.");
      }

      const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass()
      ]);
      if (requiredRoles?.length && !requiredRoles.some((role) => request.user?.roles?.includes(role))) {
        throw new ForbiddenException("Insufficient role.");
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid or expired bearer token.");
    }
  }

  private extractToken(request: Request) {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
