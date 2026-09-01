import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { sign } from 'jsonwebtoken';
import app from '../apps/backend/src/app';

describe('Player List API Tests', () => {
  let client: Client;
  let validToken: string;
  const testUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'players_test@example.com',
    username: 'playerstester',
  };

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

    // Create a valid JWT token
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured in environment');
    validToken = sign(
      { sub: testUser.id, email: testUser.email, username: testUser.username },
      secret
    );
  });

  afterAll(async () => {
    await client.end();
  });

  it('should deny access if no Authorization header is provided', async () => {
    const res = await request(app).get('/api/players');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain(
      'Missing or malformed Authorization header'
    );
  });

  it('should deny access if an invalid token is provided', async () => {
    const res = await request(app)
      .get('/api/players')
      .set('Authorization', 'Bearer invalidtokenhere');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid token');
  });

  it('should allow access and return players list with valid JWT token', async () => {
    const res = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.players).toBeDefined();
    expect(Array.isArray(res.body.players)).toBe(true);
    expect(res.body.count).toBeDefined();
    expect(typeof res.body.count).toBe('number');
    expect(res.body.count).toBeGreaterThanOrEqual(250);

    // Verify first player object shape
    const firstPlayer = res.body.players[0];
    expect(firstPlayer).toHaveProperty('id');
    expect(firstPlayer).toHaveProperty('name');
    expect(firstPlayer).toHaveProperty('category');
    expect(firstPlayer).toHaveProperty('role');
    expect(firstPlayer).toHaveProperty('nationality');
    expect(firstPlayer).toHaveProperty('is_marquee');
    expect(firstPlayer).toHaveProperty('is_capped');
    expect(firstPlayer).toHaveProperty('base_price_lakhs');
    expect(typeof firstPlayer.base_price_lakhs).toBe('number');
  });

  it('players should be sorted by category, name', async () => {
    const res = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    const players = res.body.players;

    // Check sorted order: category first, then name
    for (let i = 0; i < players.length - 1; i++) {
      const p1 = players[i];
      const p2 = players[i + 1];

      if (p1.category < p2.category) {
        // Correct order category
        continue;
      } else if (p1.category === p2.category) {
        // Equal categories, must be sorted by name
        expect(p1.name.localeCompare(p2.name)).toBeLessThanOrEqual(0);
      } else {
        // Out of order categories
        throw new Error(
          `Players out of order: "${p1.name}" (${p1.category}) and "${p2.name}" (${p2.category})`
        );
      }
    }
  });
});
