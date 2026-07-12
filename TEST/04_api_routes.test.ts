import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import app from '../apps/backend/src/app';

describe('Express API Route Tests', () => {
  const testEmail = 'api_test_user@example.com';
  const testUsername = 'api_test_user';
  const testPassword = 'secretdog6'; // 10 chars, valid

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

    // Cleanup test users from previous runs
    await client.query('DELETE FROM users WHERE email = $1', [testEmail]);
  });

  afterAll(async () => {
    // Final cleanup of test users
    await client.query('DELETE FROM users WHERE email = $1', [testEmail]);
    await client.end();
  });

  it('GET /health should return 200 and operational status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('@ipl-auction/backend');
  });

  it('POST /auth/register should fail if password is less than 6 characters', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'api_test_fail@example.com',
      username: 'api_test_fail',
      password: '12345', // 5 characters (too short)
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Password must be at least 6 characters');
  });

  it('POST /auth/register should succeed with 6+ character password', async () => {
    const res = await request(app).post('/auth/register').send({
      email: testEmail,
      username: testUsername,
      password: testPassword,
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
  });

  it('POST /auth/login should fail with invalid credentials', async () => {
    const res = await request(app).post('/auth/login').send({
      email: testEmail,
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid email or password');
  });

  it('POST /auth/login should succeed with valid credentials', async () => {
    const res = await request(app).post('/auth/login').send({
      email: testEmail,
      password: testPassword,
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe(testUsername);
  });
});
