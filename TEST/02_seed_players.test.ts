import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { execSync } from 'child_process';
import path from 'path';

describe('Player Seeding Integration Tests', () => {
  let client: Client;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    client = new Client({
      connectionString: dbUrl,
      ssl:
        dbUrl?.includes('supabase.co') || dbUrl?.includes('pooler.supabase.com')
          ? { rejectUnauthorized: false }
          : undefined,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('should run seed script and have 250+ players in players table', async () => {
    // Run the seed script via child process from the project root
    const rootPath = path.resolve(__dirname, '../');
    console.log('Running database seed script...');
    execSync('pnpm --filter @ipl-auction/database run seed', { cwd: rootPath });

    // Query players count in the database
    const res = await client.query('SELECT COUNT(*) FROM players');
    const count = parseInt(res.rows[0].count, 10);
    console.log('Total seeded players count in DB:', count);

    expect(count).toBeGreaterThanOrEqual(250);
  }, 30000);
});
