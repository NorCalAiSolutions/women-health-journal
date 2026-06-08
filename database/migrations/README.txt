Added a small PostgreSQL migration runner using plain Node + pg.

What’s new:

database/run-migrations.mjs
database/migrations/000_initial_schema.sql
Root command:
npm run db:migrate
What it does:

Reads .env
Connects to DATABASE_URL
Uses DATABASE_SCHEMA, defaulting to whjournal
Creates whjournal.schema_migrations
Runs unapplied .sql files in database/migrations in filename order
Stores filename, checksum, and applied timestamp
Skips migrations already applied
Fails if an already-applied migration file was edited


If I create a new database/schema, what scripts do I have to run in sequence?
=============================================================================


For a brand-new database/schema, use the migration runner now.

Recommended Sequence

Create the database in pgAdmin:
CREATE DATABASE whjc;
Make sure .env points to that database:
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/whjc"
DATABASE_SCHEMA="whjournal"
From PowerShell in the project folder:
cd "C:\Ai\AI Women’s Health Journal Companion"
npm run db:migrate
That’s it. The runner will create:

schema whjournal
all underlying tables
indexes
constraints
migration tracking table whjournal.schema_migrations
It runs these in order automatically:

000_initial_schema.sql
001_add_login_id.sql
002_email_verification_password_reset.sql
003_add_analysis_source.sql
After that, start the app:

npm run dev
You do not need to manually run database/schema.sql anymore. That file is now mainly the full schema snapshot/reference.