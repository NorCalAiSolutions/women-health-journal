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
  type: z.enum(["contact", "demo"]),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254).refine((email) => {
    if (process.env.ALLOW_PERSONAL_EMAIL_TESTING === "true" || process.env.NODE_ENV !== "production") {
      return true;
    }
    const domain = email.split("@")[1]?.toLowerCase();
    return Boolean(domain && !personalEmailDomains.has(domain));
  }, "Please enter a company email address."),
  organization: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10).max(2000)
});

export type ContactRequestInput = z.infer<typeof ContactRequestSchema>;
