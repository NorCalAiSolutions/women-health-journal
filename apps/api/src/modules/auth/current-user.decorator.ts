import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type AuthUser = {
  sub: string;
  userId: string;
};

export const CurrentUser = createParamDecorator((field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  return field ? request.user?.[field] : request.user;
});
