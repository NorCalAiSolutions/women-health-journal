import { createHash } from "node:crypto";
import { NextFunction, Request, Response } from "express";

type RateLimitRule = {
  name: string;
  method?: string;
  path: RegExp;
  limit: number;
  windowMs: number;
  message: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const rules: RateLimitRule[] = [
  {
    name: "login",
    method: "POST",
    path: /^\/auth\/login$/,
    limit: 5,
    windowMs: 60_000,
    message: "Too many login attempts. Please wait a minute and try again."
  },
  {
    name: "register",
    method: "POST",
    path: /^\/auth\/register$/,
    limit: 5,
    windowMs: 60 * 60_000,
    message: "Too many account creation attempts. Please wait before trying again."
  },
  {
    name: "password-reset-request",
    method: "POST",
    path: /^\/auth\/request-password-reset$/,
    limit: 3,
    windowMs: 60 * 60_000,
    message: "Too many password reset requests. Please wait before requesting another code."
  },
  {
    name: "email-verify",
    method: "POST",
    path: /^\/auth\/verify-email$/,
    limit: 10,
    windowMs: 10 * 60_000,
    message: "Too many verification attempts. Please wait before trying again."
  },
  {
    name: "password-reset-complete",
    method: "POST",
    path: /^\/auth\/reset-password$/,
    limit: 5,
    windowMs: 60 * 60_000,
    message: "Too many password reset attempts. Please wait before trying again."
  },
  {
    name: "journal-create",
    method: "POST",
    path: /^\/journal$/,
    limit: 30,
    windowMs: 60 * 60_000,
    message: "Too many journal submissions. Please wait before saving another entry."
  },
  {
    name: "journal-timeline",
    method: "GET",
    path: /^\/journal\/timeline$/,
    limit: 120,
    windowMs: 60_000,
    message: "Too many timeline requests. Please wait a moment and try again."
  },
  {
    name: "doctor-export",
    method: "GET",
    path: /^\/exports\/doctor\.pdf$/,
    limit: 10,
    windowMs: 60 * 60_000,
    message: "Too many doctor PDF downloads. Please wait before exporting again."
  },
  {
    name: "account-export",
    method: "GET",
    path: /^\/auth\/account-export$/,
    limit: 10,
    windowMs: 60 * 60_000,
    message: "Too many account exports. Please wait before exporting again."
  },
  {
    name: "account-delete",
    method: "DELETE",
    path: /^\/auth\/account$/,
    limit: 3,
    windowMs: 60 * 60_000,
    message: "Too many account deletion requests. Please wait before trying again."
  },
  {
    name: "default",
    limit: 300,
    windowMs: 60_000,
    path: /^\/.*$/,
    message: "Too many requests. Please wait a moment and try again."
  }
];

export function rateLimitMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    cleanupExpiredBuckets();

    const path = req.path;
    const rule = rules.find((candidate) => {
      const methodMatches = !candidate.method || candidate.method === req.method;
      return methodMatches && candidate.path.test(path);
    }) ?? rules[rules.length - 1];

    const now = Date.now();
    const bucketKey = `${rule.name}:${clientKey(req)}`;
    const bucket = buckets.get(bucketKey);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + rule.windowMs });
      setRateLimitHeaders(res, rule.limit, rule.limit - 1, now + rule.windowMs);
      return next();
    }

    bucket.count += 1;
    const remaining = Math.max(rule.limit - bucket.count, 0);
    setRateLimitHeaders(res, rule.limit, remaining, bucket.resetAt);

    if (bucket.count > rule.limit) {
      return res.status(429).json({
        statusCode: 429,
        error: "Too Many Requests",
        message: rule.message,
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000)
      });
    }

    return next();
  };
}

function clientKey(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0] || req.ip || req.socket.remoteAddress || "unknown";
  const authorization = req.headers.authorization ?? "";
  const identity = authorization ? `${ip}:${authorization}` : ip;
  return hash(identity.trim());
}

function setRateLimitHeaders(res: Response, limit: number, remaining: number, resetAt: number) {
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

function cleanupExpiredBuckets() {
  const now = Date.now();
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
