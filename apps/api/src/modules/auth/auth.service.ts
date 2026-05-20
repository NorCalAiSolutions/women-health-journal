import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomInt } from "node:crypto";
import { AuditContext, AuditService } from "../../common/audit.service";
import { CryptoService } from "../../common/crypto.service";
import { DatabaseService } from "../../common/database.service";
import { EmailService } from "../../common/email.service";
import {
  LoginInput,
  RegisterInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  VerifyEmailInput
} from "./auth.schemas";

type UserRow = {
  id: string;
  login_id: string | null;
  email: string;
  email_verified_at: Date | null;
  password_hash: string;
  display_name: string | null;
};

type CodeRow = {
  id: string;
  code_hash: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService
  ) {}

  async register(input: RegisterInput, context?: AuditContext) {
    const userId = input.userId.toLowerCase();
    const email = input.email.toLowerCase();
    if (await this.findByLoginId(userId)) {
      throw new ConflictException("This user ID is already registered.");
    }
    if (await this.findByEmail(email)) {
      throw new ConflictException("This email is already registered.");
    }

    const id = this.db.id();
    const passwordHash = await argon2.hash(input.password);
    await this.db.query(
      `INSERT INTO ${this.db.table("users")} (id, login_id, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, email, passwordHash, input.displayName ?? userId]
    );
    await this.audit.log(id, "ACCOUNT_REGISTERED", { loginId: userId, emailDomain: emailDomain(email) }, context);

    const verificationCode = await this.createCode("email_verification_codes", id, 24 * 60);
    const emailSent = await this.email.sendVerificationCode(email, verificationCode);
    await this.audit.log(id, "EMAIL_VERIFICATION_CODE_SENT", { emailSent }, context);
    return {
      requiresEmailVerification: true,
      emailSent,
      user: { userId, email, displayName: input.displayName ?? userId },
      devVerificationCode: !emailSent && this.includeDevCodes() ? verificationCode : undefined
    };
  }

  async login(input: LoginInput, context?: AuditContext) {
    const user = await this.findByLoginId(input.userId.toLowerCase());
    if (!user || !(await argon2.verify(user.password_hash, input.password))) {
      await this.audit.log(user?.id ?? null, "LOGIN_FAILED", { attemptedLoginId: input.userId.toLowerCase(), reason: "invalid_credentials" }, context);
      throw new UnauthorizedException("Invalid user ID or password.");
    }
    if (!user.email_verified_at) {
      await this.audit.log(user.id, "LOGIN_BLOCKED", { reason: "email_not_verified" }, context);
      throw new UnauthorizedException("Please verify your email before logging in.");
    }

    await this.audit.log(user.id, "LOGIN_SUCCEEDED", { loginId: user.login_id }, context);
    return this.issueToken(user);
  }

  async verifyEmail(input: VerifyEmailInput, context?: AuditContext) {
    const user = await this.findByLoginId(input.userId.toLowerCase());
    if (!user) {
      throw new UnauthorizedException("Invalid user ID or verification code.");
    }

    await this.consumeCode("email_verification_codes", user.id, input.code);
    await this.db.query(
      `UPDATE ${this.db.table("users")}
       SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
       WHERE id = $1`,
      [user.id]
    );
    await this.audit.log(user.id, "EMAIL_VERIFIED", { loginId: user.login_id }, context);

    return this.issueToken({ id: user.id, login_id: user.login_id, display_name: user.display_name });
  }

  async requestPasswordReset(input: RequestPasswordResetInput, context?: AuditContext) {
    const user = await this.findByEmail(input.email.toLowerCase());
    if (!user) {
      await this.audit.log(null, "PASSWORD_RESET_REQUESTED", { matchedUser: false, emailDomain: emailDomain(input.email) }, context);
      return { message: "If that email is registered, a reset code has been sent." };
    }

    const resetCode = await this.createCode("password_reset_codes", user.id, 30);
    const emailSent = await this.email.sendPasswordResetCode(user.email, resetCode);
    await this.audit.log(user.id, "PASSWORD_RESET_REQUESTED", { matchedUser: true, emailSent }, context);
    return {
      message: "If that email is registered, a reset code has been sent.",
      emailSent,
      devResetCode: !emailSent && this.includeDevCodes() ? resetCode : undefined
    };
  }

  async resetPassword(input: ResetPasswordInput, context?: AuditContext) {
    const user = await this.findByEmail(input.email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException("Invalid email or reset code.");
    }

    await this.consumeCode("password_reset_codes", user.id, input.code);
    const passwordHash = await argon2.hash(input.newPassword);
    await this.db.query(
      `UPDATE ${this.db.table("users")}
       SET password_hash = $1, email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
       WHERE id = $2`,
      [passwordHash, user.id]
    );
    await this.audit.log(user.id, "PASSWORD_RESET_COMPLETED", {}, context);

    return this.issueToken({ id: user.id, login_id: user.login_id, display_name: user.display_name });
  }

  async me(userId: string) {
    const result = await this.db.query<Pick<UserRow, "id" | "login_id" | "display_name" | "email">>(
      `SELECT id, login_id, display_name, email FROM ${this.db.table("users")} WHERE id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException("User no longer exists.");
    }
    return {
      id: user.id,
      userId: user.login_id,
      email: user.email,
      displayName: user.display_name
    };
  }

  async exportAccount(userId: string, context?: AuditContext) {
    const userResult = await this.db.query<Pick<UserRow, "id" | "login_id" | "email" | "display_name" | "email_verified_at"> & { created_at: Date }>(
      `SELECT id, login_id, email, display_name, email_verified_at, created_at
       FROM ${this.db.table("users")}
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new UnauthorizedException("User no longer exists.");
    }

    const entries = await this.db.query<{
      id: string;
      occurred_at: Date;
      created_at: Date;
      raw_text_ciphertext: string;
      raw_text_nonce: string;
      structured_json: Record<string, unknown>;
      extracted_json: Record<string, unknown> | null;
      red_flags: unknown[];
    }>(
      `SELECT
         je.id,
         je.occurred_at,
         je.created_at,
         je.raw_text_ciphertext,
         je.raw_text_nonce,
         je.structured_json,
         ae.extracted_json,
         COALESCE(jsonb_agg(jsonb_build_object(
           'category', rfe.category,
           'severity', rfe.severity,
           'guidance', rfe.guidance,
           'matchedText', rfe.matched_text,
           'createdAt', rfe.created_at
         )) FILTER (WHERE rfe.id IS NOT NULL), '[]'::jsonb) AS red_flags
       FROM ${this.db.table("journal_entries")} je
       LEFT JOIN ${this.db.table("ai_extractions")} ae ON ae.journal_entry_id = je.id
       LEFT JOIN ${this.db.table("red_flag_events")} rfe ON rfe.journal_entry_id = je.id
       WHERE je.user_id = $1
       GROUP BY je.id, je.occurred_at, je.created_at, je.raw_text_ciphertext, je.raw_text_nonce, je.structured_json, ae.extracted_json
       ORDER BY je.occurred_at ASC`,
      [userId]
    );

    const consents = await this.db.query(
      `SELECT scope, granted, version, created_at FROM ${this.db.table("consents")} WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );

    await this.audit.log(
      userId,
      "ACCOUNT_EXPORT_DOWNLOADED",
      {
        format: "json",
        journalEntryCount: entries.rowCount ?? entries.rows.length,
        consentRecordCount: consents.rowCount ?? consents.rows.length
      },
      context
    );

    return {
      generatedAt: new Date().toISOString(),
      disclaimer: "User-controlled export. AI outputs are informational only and are not diagnoses.",
      user: {
        id: user.id,
        userId: user.login_id,
        email: user.email,
        displayName: user.display_name,
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.created_at
      },
      consents: consents.rows,
      journalEntries: entries.rows.map((entry) => ({
        id: entry.id,
        occurredAt: entry.occurred_at,
        createdAt: entry.created_at,
        rawText: this.crypto.decrypt(entry.raw_text_ciphertext, entry.raw_text_nonce),
        structured: entry.structured_json,
        aiExtraction: entry.extracted_json,
        redFlags: entry.red_flags
      }))
    };
  }

  async deleteAccount(userId: string, context?: AuditContext) {
    const counts = await this.accountCounts(userId);
    await this.audit.log(userId, "ACCOUNT_DELETE_REQUESTED", counts, context);
    const result = await this.db.query(`DELETE FROM ${this.db.table("users")} WHERE id = $1`, [userId]);
    return {
      deleted: (result.rowCount ?? 0) > 0,
      message: "Account and journal data deleted."
    };
  }

  private async findByLoginId(loginId: string) {
    const result = await this.db.query<UserRow>(
      `SELECT id, login_id, email, email_verified_at, password_hash, display_name
       FROM ${this.db.table("users")}
       WHERE login_id = $1 AND deleted_at IS NULL`,
      [loginId]
    );
    return result.rows[0];
  }

  private async findByEmail(email: string) {
    const result = await this.db.query<UserRow>(
      `SELECT id, login_id, email, email_verified_at, password_hash, display_name
       FROM ${this.db.table("users")}
       WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [email]
    );
    return result.rows[0];
  }

  private async createCode(table: "email_verification_codes" | "password_reset_codes", userId: string, ttlMinutes: number) {
    const code = String(randomInt(100000, 1000000));
    await this.db.query(
      `INSERT INTO ${this.db.table(table)} (id, user_id, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
      [this.db.id(), userId, await argon2.hash(code), String(ttlMinutes)]
    );
    return code;
  }

  private async consumeCode(table: "email_verification_codes" | "password_reset_codes", userId: string, code: string) {
    const result = await this.db.query<CodeRow>(
      `SELECT id, code_hash
       FROM ${this.db.table(table)}
       WHERE user_id = $1
         AND used_at IS NULL
         AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    for (const row of result.rows) {
      if (await argon2.verify(row.code_hash, code)) {
        await this.db.query(`UPDATE ${this.db.table(table)} SET used_at = now() WHERE id = $1`, [row.id]);
        return;
      }
    }

    throw new UnauthorizedException("Invalid or expired code.");
  }

  private includeDevCodes() {
    return process.env.NODE_ENV !== "production";
  }

  private async issueToken(user: Pick<UserRow, "id" | "login_id" | "display_name">) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      userId: user.login_id
    });

    return {
      accessToken,
      tokenType: "Bearer",
      user: {
        id: user.id,
        userId: user.login_id,
        displayName: user.display_name
      }
    };
  }

  private async accountCounts(userId: string) {
    const result = await this.db.query<{
      journal_entries: string;
      ai_extractions: string;
      red_flag_events: string;
      consents: string;
    }>(
      `SELECT
         (SELECT count(*) FROM ${this.db.table("journal_entries")} WHERE user_id = $1)::text AS journal_entries,
         (SELECT count(*) FROM ${this.db.table("ai_extractions")} ae
            JOIN ${this.db.table("journal_entries")} je ON je.id = ae.journal_entry_id
            WHERE je.user_id = $1)::text AS ai_extractions,
         (SELECT count(*) FROM ${this.db.table("red_flag_events")} WHERE user_id = $1)::text AS red_flag_events,
         (SELECT count(*) FROM ${this.db.table("consents")} WHERE user_id = $1)::text AS consents`,
      [userId]
    );
    const row = result.rows[0];
    return {
      journalEntryCount: Number(row?.journal_entries ?? 0),
      aiExtractionCount: Number(row?.ai_extractions ?? 0),
      redFlagEventCount: Number(row?.red_flag_events ?? 0),
      consentRecordCount: Number(row?.consents ?? 0)
    };
  }
}

function emailDomain(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "unknown";
}
