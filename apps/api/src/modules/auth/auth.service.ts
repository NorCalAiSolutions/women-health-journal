import { ConflictException, Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { AuditContext, AuditService } from "../../common/audit.service";
import { CryptoService } from "../../common/crypto.service";
import { DatabaseService } from "../../common/database.service";
import {
  AcceptPolicyConsentsInput,
  AdminCreateUserInput,
  AdminResetPasswordInput,
  ChangePasswordInput,
  LoginInput,
  RegisterInput
} from "./auth.schemas";

const POLICY_VERSION = "2026-05-22";
const REQUIRED_POLICY_SCOPES = ["TERMS_OF_USE", "PRIVACY_POLICY", "AI_DISCLOSURE", "DATA_RIGHTS"] as const;

type UserRow = {
  id: string;
  login_id: string | null;
  email: string;
  email_verified_at: Date | null;
  password_hash: string;
  display_name: string | null;
  roles: string[];
  must_change_password: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
  age_range: string | null;
  period_started_age_range: string | null;
  hormonal_medication_context: string | null;
  pregnancy_postpartum_status: string | null;
  cycle_baseline: string | null;
};

type HealthContextInput = Pick<
  RegisterInput,
  "ageRange" | "periodStartedAgeRange" | "hormonalMedicationContext" | "pregnancyPostpartumStatus" | "cycleBaseline"
>;

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService
  ) {}

  async onModuleInit() {
    await this.ensureSeedAdmin();
  }

  async adminCreateUser(input: AdminCreateUserInput, context?: AuditContext) {
    const email = input.email.toLowerCase();
    const userId = email;
    if (await this.findByLoginId(userId)) {
      throw new ConflictException("This email is already registered as a user ID.");
    }
    if (await this.findByEmail(email)) {
      throw new ConflictException("This email is already assigned to another account.");
    }

    const id = this.db.id();
    const passwordHash = await argon2.hash(input.password);
    await this.db.query(
      `INSERT INTO ${this.db.table("users")}
        (id, login_id, email, email_verified_at, password_hash, display_name, roles, must_change_password, age_range, period_started_age_range, hormonal_medication_context, pregnancy_postpartum_status, cycle_baseline)
       VALUES ($1, $2, $3, now(), $4, $5, $6, true, $7, $8, $9, $10, $11)`,
      [
        id,
        userId,
        email,
        passwordHash,
        input.displayName ?? userId,
        [input.role ?? "user"],
        input.ageRange ?? null,
        input.periodStartedAgeRange ?? null,
        input.hormonalMedicationContext ?? null,
        input.pregnancyPostpartumStatus ?? null,
        input.cycleBaseline ?? null
      ]
    );
    await this.audit.log(id, "ACCOUNT_CREATED_BY_ADMIN", { loginId: userId, emailDomain: emailDomain(email), role: input.role ?? "user", healthContextProvided: hasHealthContext(input) }, context);

    return this.safeUser({
      id,
      login_id: userId,
      email,
      display_name: input.displayName ?? userId,
      roles: [input.role ?? "user"],
      must_change_password: true,
      email_verified_at: new Date(),
      locked_until: null,
    });
  }

  async login(input: LoginInput, context?: AuditContext) {
    const user = await this.findByLoginId(input.userId.toLowerCase());
    if (user?.locked_until && user.locked_until > new Date()) {
      await this.audit.log(user.id, "LOGIN_BLOCKED", { reason: "account_locked" }, context);
      throw new UnauthorizedException("Account is temporarily locked.");
    }
    if (!user || !(await argon2.verify(user.password_hash, input.password))) {
      if (user) {
        await this.recordFailedLogin(user);
      }
      await this.audit.log(user?.id ?? null, "LOGIN_FAILED", { attemptedLoginId: input.userId.toLowerCase(), reason: "invalid_credentials" }, context);
      throw new UnauthorizedException("Invalid user ID or password.");
    }

    await this.db.query(
      `UPDATE ${this.db.table("users")}
       SET failed_login_attempts = 0, locked_until = NULL, updated_at = now()
       WHERE id = $1`,
      [user.id]
    );
    await this.audit.log(user.id, "LOGIN_SUCCEEDED", { loginId: user.login_id }, context);
    return this.issueToken(user);
  }

  async changePassword(userId: string, input: Omit<ChangePasswordInput, "userId">, context?: AuditContext) {
    const user = await this.findById(userId);
    if (!user) {
      throw new UnauthorizedException("User no longer exists.");
    }
    if (!(await argon2.verify(user.password_hash, input.currentPassword))) {
      await this.audit.log(user.id, "PASSWORD_CHANGE_FAILED", { reason: "invalid_current_password" }, context);
      throw new UnauthorizedException("Current password is incorrect.");
    }

    const passwordHash = await argon2.hash(input.newPassword);
    await this.db.query(
      `UPDATE ${this.db.table("users")}
       SET password_hash = $1, must_change_password = false, email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
       WHERE id = $2`,
      [passwordHash, user.id]
    );
    await this.audit.log(user.id, "PASSWORD_CHANGED", {}, context);

    return this.issueToken({ ...user, must_change_password: false });
  }

  async adminResetPassword(userId: string, input: AdminResetPasswordInput, context?: AuditContext) {
    const user = await this.findById(userId);
    if (!user) {
      throw new UnauthorizedException("User not found.");
    }
    const passwordHash = await argon2.hash(input.temporaryPassword);
    await this.db.query(
      `UPDATE ${this.db.table("users")}
       SET password_hash = $1, must_change_password = true, failed_login_attempts = 0, locked_until = NULL, updated_at = now()
       WHERE id = $2`,
      [passwordHash, userId]
    );
    await this.audit.log(userId, "PASSWORD_RESET_BY_ADMIN", { loginId: user.login_id }, context);
    return this.safeUser({ ...user, must_change_password: true, locked_until: null });
  }

  async listUsers() {
    const result = await this.db.query<UserRow>(
      `SELECT id, login_id, email, email_verified_at, password_hash, display_name, roles, must_change_password, failed_login_attempts, locked_until, age_range, period_started_age_range, hormonal_medication_context, pregnancy_postpartum_status, cycle_baseline
       FROM ${this.db.table("users")}
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC`
    );
    return result.rows.map((user) => this.safeUser(user));
  }

  async me(userId: string) {
    const result = await this.db.query<Pick<UserRow, "id" | "login_id" | "display_name" | "email" | "roles" | "must_change_password" | "age_range" | "period_started_age_range" | "hormonal_medication_context" | "pregnancy_postpartum_status" | "cycle_baseline">>(
      `SELECT id, login_id, display_name, email, roles, must_change_password, age_range, period_started_age_range, hormonal_medication_context, pregnancy_postpartum_status, cycle_baseline
       FROM ${this.db.table("users")}
       WHERE id = $1`,
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
      displayName: user.display_name,
      roles: user.roles,
      mustChangePassword: user.must_change_password,
      healthContext: healthContextFromUser(user),
      policyConsent: await this.policyConsentStatus(userId)
    };
  }

  async policyConsentStatus(userId: string) {
    const result = await this.db.query<{ scope: string; version: string; created_at: Date }>(
      `SELECT DISTINCT ON (scope) scope, version, created_at
       FROM ${this.db.table("consents")}
       WHERE user_id = $1
         AND scope = ANY($2::text[])
         AND granted = true
       ORDER BY scope, created_at DESC`,
      [userId, REQUIRED_POLICY_SCOPES]
    );
    const accepted = new Map(result.rows.map((row) => [row.scope, row]));
    const missingScopes = REQUIRED_POLICY_SCOPES.filter((scope) => accepted.get(scope)?.version !== POLICY_VERSION);

    return {
      required: missingScopes.length > 0,
      version: POLICY_VERSION,
      missingScopes,
      acceptedScopes: REQUIRED_POLICY_SCOPES.filter((scope) => accepted.get(scope)?.version === POLICY_VERSION),
      acceptedAt: result.rows
        .filter((row) => row.version === POLICY_VERSION)
        .map((row) => row.created_at)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
    };
  }

  async acceptPolicyConsents(userId: string, _input: AcceptPolicyConsentsInput, context?: AuditContext) {
    for (const scope of REQUIRED_POLICY_SCOPES) {
      await this.db.query(
        `INSERT INTO ${this.db.table("consents")} (id, user_id, scope, granted, version)
         VALUES ($1, $2, $3, true, $4)`,
        [this.db.id(), userId, scope, POLICY_VERSION]
      );
    }
    await this.audit.log(userId, "POLICY_CONSENTS_ACCEPTED", { version: POLICY_VERSION, scopes: REQUIRED_POLICY_SCOPES }, context);
    return this.policyConsentStatus(userId);
  }

  async exportAccount(userId: string, context?: AuditContext) {
    const userResult = await this.db.query<Pick<UserRow, "id" | "login_id" | "email" | "display_name" | "email_verified_at" | "age_range" | "period_started_age_range" | "hormonal_medication_context" | "pregnancy_postpartum_status" | "cycle_baseline"> & { created_at: Date }>(
      `SELECT id, login_id, email, display_name, email_verified_at, age_range, period_started_age_range, hormonal_medication_context, pregnancy_postpartum_status, cycle_baseline, created_at
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
      analysis_source: string | null;
      model: string | null;
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
         ae.analysis_source,
         ae.model,
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
       GROUP BY je.id, je.occurred_at, je.created_at, je.raw_text_ciphertext, je.raw_text_nonce, je.structured_json, ae.extracted_json, ae.analysis_source, ae.model
       ORDER BY je.occurred_at ASC`,
      [userId]
    );

    const consents = await this.db.query(
      `SELECT scope, granted, version, created_at FROM ${this.db.table("consents")} WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    const cycleImports = await this.db.query(
      `SELECT id, source_type, source_label, normalized_json, confidence, ignored_identifiers_json, created_at
       FROM ${this.db.table("cycle_imports")}
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );

    await this.audit.log(
      userId,
      "ACCOUNT_EXPORT_DOWNLOADED",
      {
        format: "json",
        journalEntryCount: entries.rowCount ?? entries.rows.length,
        consentRecordCount: consents.rowCount ?? consents.rows.length,
        cycleImportCount: cycleImports.rowCount ?? cycleImports.rows.length
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
        healthContext: healthContextFromUser(user),
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.created_at
      },
      consents: consents.rows,
      cycleImports: cycleImports.rows.map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        sourceLabel: row.source_label,
        normalized: row.normalized_json,
        confidence: row.confidence,
        ignoredIdentifiers: row.ignored_identifiers_json,
        createdAt: row.created_at
      })),
      journalEntries: entries.rows.map((entry) => ({
        id: entry.id,
        occurredAt: entry.occurred_at,
        createdAt: entry.created_at,
        rawText: this.crypto.decrypt(entry.raw_text_ciphertext, entry.raw_text_nonce),
        structured: entry.structured_json,
        aiExtraction: entry.extracted_json
          ? {
              analysisSource: entry.analysis_source ?? "unknown",
              model: entry.model ?? "unknown",
              extractedJson: entry.extracted_json
            }
          : null,
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
      `SELECT id, login_id, email, email_verified_at, password_hash, display_name, roles, must_change_password, failed_login_attempts, locked_until, age_range, period_started_age_range, hormonal_medication_context, pregnancy_postpartum_status, cycle_baseline
       FROM ${this.db.table("users")}
       WHERE login_id = $1 AND deleted_at IS NULL`,
      [loginId]
    );
    return result.rows[0];
  }

  private async findByEmail(email: string) {
    const result = await this.db.query<UserRow>(
      `SELECT id, login_id, email, email_verified_at, password_hash, display_name, roles, must_change_password, failed_login_attempts, locked_until, age_range, period_started_age_range, hormonal_medication_context, pregnancy_postpartum_status, cycle_baseline
       FROM ${this.db.table("users")}
       WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [email]
    );
    return result.rows[0];
  }

  private async findById(id: string) {
    const result = await this.db.query<UserRow>(
      `SELECT id, login_id, email, email_verified_at, password_hash, display_name, roles, must_change_password, failed_login_attempts, locked_until, age_range, period_started_age_range, hormonal_medication_context, pregnancy_postpartum_status, cycle_baseline
       FROM ${this.db.table("users")}
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0];
  }

  private async ensureSeedAdmin() {
    const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@whjc.example").toLowerCase();
    const loginId = (process.env.SEED_ADMIN_USER_ID ?? email).toLowerCase();
    if (await this.findByLoginId(loginId)) {
      return;
    }

    await this.db.query(
      `INSERT INTO ${this.db.table("users")}
        (id, login_id, email, email_verified_at, password_hash, display_name, roles, must_change_password)
       VALUES ($1, $2, $3, now(), $4, $5, ARRAY['admin']::text[], true)`,
      [
        this.db.id(),
        loginId,
        email,
        await argon2.hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe12345!"),
        process.env.SEED_ADMIN_DISPLAY_NAME ?? "Journal Admin"
      ]
    );
  }

  private async recordFailedLogin(user: UserRow) {
    const attempts = user.failed_login_attempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000) : null;
    await this.db.query(
      `UPDATE ${this.db.table("users")}
       SET failed_login_attempts = $1,
           locked_until = $2,
           updated_at = now()
       WHERE id = $3`,
      [lockedUntil ? 0 : attempts, lockedUntil, user.id]
    );
  }

  private async issueToken(user: Pick<UserRow, "id" | "login_id" | "display_name" | "roles" | "must_change_password">) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      userId: user.login_id,
      roles: user.roles,
      mustChangePassword: user.must_change_password
    });

    return {
      accessToken,
      tokenType: "Bearer",
      user: {
        id: user.id,
        userId: user.login_id,
        displayName: user.display_name,
        roles: user.roles,
        mustChangePassword: user.must_change_password
      }
    };
  }

  private safeUser(user: Pick<UserRow, "id" | "login_id" | "email" | "display_name" | "roles" | "must_change_password" | "email_verified_at" | "locked_until">) {
    return {
      id: user.id,
      userId: user.login_id,
      email: user.email,
      displayName: user.display_name,
      roles: user.roles,
      mustChangePassword: user.must_change_password,
      active: !user.locked_until || user.locked_until <= new Date(),
      emailVerifiedAt: user.email_verified_at
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

function healthContextFromInput(input: HealthContextInput) {
  return {
    ageRange: input.ageRange ?? null,
    periodStartedAgeRange: input.periodStartedAgeRange ?? null,
    hormonalMedicationContext: input.hormonalMedicationContext ?? null,
    pregnancyPostpartumStatus: input.pregnancyPostpartumStatus ?? null,
    cycleBaseline: input.cycleBaseline ?? null
  };
}

function healthContextFromUser(
  user: Pick<
    UserRow,
    "age_range" | "period_started_age_range" | "hormonal_medication_context" | "pregnancy_postpartum_status" | "cycle_baseline"
  >
) {
  return {
    ageRange: user.age_range,
    periodStartedAgeRange: user.period_started_age_range,
    hormonalMedicationContext: user.hormonal_medication_context,
    pregnancyPostpartumStatus: user.pregnancy_postpartum_status,
    cycleBaseline: user.cycle_baseline
  };
}

function hasHealthContext(input: HealthContextInput) {
  return Object.values(healthContextFromInput(input)).some(Boolean);
}
