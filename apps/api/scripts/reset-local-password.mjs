import argon2 from "argon2";
import pg from "pg";

const [loginId, newPassword] = process.argv.slice(2);

if (!loginId || !newPassword || newPassword.length < 8) {
  console.error("Usage: node apps/api/scripts/reset-local-password.mjs <loginId> <newPassword>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:Welcome1@localhost:5432/whjc";
const schema = process.env.DATABASE_SCHEMA ?? "whjournal";

if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
  throw new Error("Invalid DATABASE_SCHEMA");
}

const pool = new pg.Pool({ connectionString });
const passwordHash = await argon2.hash(newPassword);
const result = await pool.query(
  `UPDATE "${schema}"."users"
   SET password_hash = $1,
       email_verified_at = COALESCE(email_verified_at, now()),
       updated_at = now()
   WHERE lower(login_id) = lower($2)
   RETURNING login_id, email, email_verified_at`,
  [passwordHash, loginId]
);

await pool.end();

if (!result.rowCount) {
  console.error(`No user found for login_id ${loginId}`);
  process.exit(1);
}

console.log(`Reset password and verified email for ${result.rows[0].login_id} (${result.rows[0].email}).`);
