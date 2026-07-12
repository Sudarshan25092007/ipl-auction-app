import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Database Schema Integration Tests', () => {
  let client: Client;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    expect(connectionString).toBeDefined();
    client = new Client({
      connectionString,
      ssl:
        connectionString?.includes('supabase.co') ||
        connectionString?.includes('pooler.supabase.com')
          ? { rejectUnauthorized: false }
          : undefined,
    });
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  it('should have all 8 required tables', async () => {
    const requiredTables = [
      'users',
      'rooms',
      'room_members',
      'players',
      'auction_queue',
      'bids',
      'squad_players',
      'bid_events',
    ];

    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    const res = await client.query(query);
    const existingTables = res.rows.map(
      (row: { table_name: string }) => row.table_name
    );

    for (const table of requiredTables) {
      expect(existingTables).toContain(table);
    }
  });

  it('should have correct primary key constraints', async () => {
    const tables = [
      'users',
      'rooms',
      'room_members',
      'players',
      'auction_queue',
      'bids',
      'squad_players',
      'bid_events',
    ];

    for (const table of tables) {
      const query = `
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = '${table}'::regclass AND i.indisprimary;
      `;
      const res = await client.query(query);
      expect(res.rows.length).toBeGreaterThanOrEqual(1);
      expect(res.rows[0].attname).toBe('id');
    }
  });

  it('should have index on idx_users_email', async () => {
    const res = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = 'users' AND indexname = 'idx_users_email'
    `);
    expect(res.rows.length).toBe(1);
  });
});
