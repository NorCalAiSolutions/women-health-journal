import { createHash, randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

export type RequestWithLogging = Request & {
  requestId?: string;
  requestStartedAt?: number;
};

const logger = new Logger("HttpRequest");

export function requestLoggingMiddleware() {
  return (req: RequestWithLogging, res: Response, next: NextFunction) => {
    const requestId = requestIdFromHeader(req.headers["x-request-id"]);
    const startedAt = Date.now();

    req.requestId = requestId;
    req.requestStartedAt = startedAt;
    res.setHeader("X-Request-ID", requestId);

    res.on("finish", () => {
      const statusCode = res.statusCode;
      const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "log";
      logger[level](
        JSON.stringify({
          event: "http_request_completed",
          requestId,
          method: req.method,
          path: req.path,
          statusCode,
          durationMs: Date.now() - startedAt,
          clientHash: clientHash(req),
          userIdHash: userIdHash(req)
        })
      );
    });

    next();
  };
}

export function requestId(req: Request) {
  return (req as RequestWithLogging).requestId ?? "req_unknown";
}

export function requestDurationMs(req: Request) {
  const startedAt = (req as RequestWithLogging).requestStartedAt;
  return startedAt ? Date.now() - startedAt : undefined;
}

function requestIdFromHeader(value: Request["headers"][string]) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && /^[a-zA-Z0-9_.:-]{8,80}$/.test(raw)) {
    return raw;
  }
  return `req_${randomUUID()}`;
}

function clientHash(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0] || req.ip || req.socket.remoteAddress || "unknown";
  return hash(String(ip).trim());
}

function userIdHash(req: Request) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return undefined;

  const [, payload] = authorization.slice("Bearer ".length).split(".");
  if (!payload) return undefined;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof decoded.sub === "string" ? hash(decoded.sub) : undefined;
  } catch {
    return undefined;
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
