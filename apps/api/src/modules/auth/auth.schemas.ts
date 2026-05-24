import { z } from "zod";

export const RegisterSchema = z.object({
  userId: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._@-]+$/),
  email: z.string().trim().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  displayName: z.string().trim().min(1).max(120).optional(),
  ageRange: z.enum(["13_17", "18_24", "25_34", "35_44", "45_plus", "prefer_not_to_say"]).optional(),
  periodStartedAgeRange: z.enum(["before_10", "10_12", "13_15", "16_plus", "not_started", "not_sure", "prefer_not_to_say"]).optional(),
  hormonalMedicationContext: z.enum(["none", "contraception", "hormonal_medication", "both", "unsure", "prefer_not_to_say"]).optional(),
  pregnancyPostpartumStatus: z.enum(["not_pregnant_or_postpartum", "pregnant", "postpartum", "trying_to_conceive", "unsure", "prefer_not_to_say"]).optional(),
  cycleBaseline: z.enum(["regular", "somewhat_irregular", "irregular", "no_periods", "not_sure", "prefer_not_to_say"]).optional()
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
  userId: z.string().trim().min(3).max(80),
  email: z.string().trim().email().max(254)
});

export const ResetPasswordSchema = z.object({
  userId: z.string().trim().min(3).max(80),
  email: z.string().trim().email().max(254),
  code: z.string().trim().min(4).max(20),
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(200)
});

export const AcceptPolicyConsentsSchema = z.object({
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  aiDisclosureAccepted: z.literal(true),
  dataRightsAccepted: z.literal(true)
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;
export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type AcceptPolicyConsentsInput = z.infer<typeof AcceptPolicyConsentsSchema>;
