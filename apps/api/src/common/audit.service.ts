import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Request } from "express";
import { DatabaseService } from "./database.service";

export type AuditContext = {
  ipHash?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  contextFromRequest(req: Request): AuditContext {
    const forwarded = req.headers["x-forwarded-for"];
    const rawIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0] || req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    return {
      ipHash: rawIp ? hashValue(rawIp.trim()) : undefined,
      userAgent: typeof userAgent === "string" ? userAgent.slice(0, 240) : undefined
    };
  }

  async log(userId: string | null, action: string, metadata: Record<string, unknown> = {}, context?: AuditContext) {
    try {
      await this.db.query(
        `INSERT INTO ${this.db.table("audit_events")} (id, user_id, action, metadata, ip_hash)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [
          this.db.id(),
          userId,
          action,
          JSON.stringify({
            ...metadata,
            userAgent: context?.userAgent
          }),
          context?.ipHash ?? null
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown audit logging error";
      this.logger.warn(`Audit event ${action} was not recorded: ${message}`);
    }
  }
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
