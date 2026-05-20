import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

export function parseZod<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) {
    return result.data;
  }

  throw new BadRequestException(result.error.issues.map((issue) => issue.message));
}
