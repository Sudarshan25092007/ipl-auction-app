/**
 * packages/database/src/migrate.ts
 *
 * MAJOR FUNCTION: Database migration runner.
 * Connects to PostgreSQL, reads all SQL migrations from packages/database/migrations,
 * and executes them in alphanumeric order.
 *
 * SYSTEM CONCEPT — Schema Versioning & Single Run:
 *   Runs in a single transaction (where possible) to apply core schema tables.
 *   This runner acts as our database provisioner.
 */
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is missing.');
    console.error('Please configure DATABASE_URL in the root .env file.');
    process.exit(1);
  }

  console.info('[Migration] Starting database migrations...');

  // Create client directly for executing DDL commands
  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    await client.connect();
    console.info('🔌 Connected to database for migrations.');

    const migrationsDir = path.join(__dirname, '../migrations');

    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort(); // Run 001, 002, 003 sequentially

    if (files.length === 0) {
      console.warn('⚠️ No migration SQL files found.');
      return;
    }

    for (const file of files) {
      console.info(`⚙️  Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute SQL schema block
      await client.query(sql);
      console.info(`✅ Migration ${file} applied successfully.`);
    }

    console.info('🎉 All database migrations applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
