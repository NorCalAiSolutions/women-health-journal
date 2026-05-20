import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomInt } from "node:crypto";
import { DatabaseService } from "../../common/database.service";
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
    private readonly jwt: JwtService
  ) {}

  async register(input: RegisterInput) {
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

    const verificationCode = await this.createCode("email_verification_codes", id, 24 * 60);
    return {
      requiresEmailVerification: true,
      user: { userId, email, displayName: input.displayName ?? userId },
      devVerificationCode: this.includeDevCodes() ? verificationCode : undefined
    };
  }

  async login(input: LoginInput) {
    const user = await this.findByLoginId(input.userId.toLowerCase());
    if (!user || !(await argon2.verify(user.password_hash, input.password))) {
      throw new UnauthorizedException("Invalid user ID or password.");
    }
    if (!user.email_verified_at) {
      throw new UnauthorizedException("Please verify your email before logging in.");
    }

    return this.issueToken(user);
  }

  async verifyEmail(input: VerifyEmailInput) {
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

    return this.issueToken({ id: user.id, login_id: user.login_id, display_name: user.display_name });
  }

  async requestPasswordReset(input: RequestPasswordResetInput) {
    const user = await this.findByEmail(input.email.toLowerCase());
    if (!user) {
      return { message: "If that email is registered, a reset code has been sent." };
    }

    const resetCode = await this.createCode("password_reset_codes", user.id, 30);
    return {
      message: "If that email is registered, a reset code has been sent.",
      devResetCode: this.includeDevCodes() ? resetCode : undefined
    };
  }

  async resetPassword(input: ResetPasswordInput) {
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

  private async findByLoginId(loginId: string) {
    const result = await this.db.query<UserRow>(
      `SELECT id, login_id, email, email_verified_at, password_hash, display_name
       FROM ${this.db.table("users")}
       WHERE login_id = $1`,
      [loginId]
    );
    return result.rows[0];
  }

  private async findByEmail(email: string) {
    const result = await this.db.query<UserRow>(
      `SELECT id, login_id, email, email_verified_at, password_hash, display_name
       FROM ${this.db.table("users")}
       WHERE lower(email) = lower($1)`,
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
}
