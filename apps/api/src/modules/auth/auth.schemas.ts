import { z } from "zod";

export const RegisterSchema = z.object({
  userId: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._@-]+$/),
  email: z.string().trim().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  displayName: z.string().trim().min(1).max(120).optional()
});

export const LoginSchema = z.object({
  userId: z.string().trim().min(3).max(80),
  password: z.string().min(1).max(200)
});

export const VerifyEmailSchema = z.object({
  userId: z.string().trim().min(3).max(80),
  code: z.string().trim().min(4).max(20)
});

export const RequestPasswordResetSchema = z.object({
  email: z.string().trim().email().max(254)
});

export const ResetPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().min(4).max(20),
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(200)
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;
export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
