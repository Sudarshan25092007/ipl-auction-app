import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import {
  parsePriceLakhs,
  deriveRole,
  isMarquee,
  isCapped,
} from '../packages/database/seeds/seedPlayers';

describe('Seed Parser Unit & Integration Tests', () => {
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

  it('should parse pricing correctly to Lakhs', () => {
    expect(parsePriceLakhs('50l')).toBe(50);
    expect(parsePriceLakhs('1.5 cr')).toBe(150);
    expect(parsePriceLakhs('2cr')).toBe(200);
    expect(parsePriceLakhs(' 1.5 CR ')).toBe(150);
  });

  it('should derive roles correctly', () => {
    expect(deriveRole('Indian Premium Batters Capped')).toBe('batter');
    expect(deriveRole('Overseas Premium Pacers')).toBe('pacer');
    expect(deriveRole('Indian Class Allrounders')).toBe('allrounder');
    expect(deriveRole('Overseas Premium WK')).toBe('wk');
  });

  it('should check marquee status correctly', () => {
    expect(isMarquee('Indian Premium Batters Capped')).toBe(true);
    expect(isMarquee('Indian Class Pacers')).toBe(false);
  });

  it('should check capped status correctly', () => {
    expect(isCapped('Indian Premium Uncapped')).toBe(false);
    expect(isCapped('Indian Premium Capped')).toBe(true);
  });

  it('database should contain >= 250 real players', async () => {
    const res = await client.query('SELECT COUNT(*) FROM players');
    const count = parseInt(res.rows[0].count, 10);
    expect(count).toBeGreaterThanOrEqual(250);
  });
});
