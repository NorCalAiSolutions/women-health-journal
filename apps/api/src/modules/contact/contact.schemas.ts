import { z } from "zod";

const personalEmailDomains = new Set([
  "aol.com",
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "ymail.com"
]);

export const ContactRequestSchema = z.object({
  type: z.enum(["contact", "demo", "register"]),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  organization: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10).max(2000)
}).superRefine((input, context) => {
  if (
    input.type === "register" ||
    process.env.ALLOW_PERSONAL_EMAIL_TESTING === "true" ||
    process.env.NODE_ENV !== "production"
  ) {
    return;
  }
  const domain = input.email.split("@")[1]?.toLowerCase();
  if (!domain || personalEmailDomains.has(domain)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: "Please enter a company email address."
    });
  }
});

export type ContactRequestInput = z.infer<typeof ContactRequestSchema>;
