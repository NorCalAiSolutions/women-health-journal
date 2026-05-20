import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthUser } from "./current-user.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

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
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired bearer token.");
    }
  }

  private extractToken(request: Request) {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
