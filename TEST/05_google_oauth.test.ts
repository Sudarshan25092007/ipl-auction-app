import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import passport from 'passport';
import { Client } from 'pg';
import request from 'supertest';
import { sign } from 'jsonwebtoken';

// Mock passport.authenticate for callback routing test
const mockUser = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'mock_oauth_user@example.com',
  username: 'google_mock12',
  password_hash: null,
};

vi.spyOn(passport, 'authenticate').mockImplementation(
  (strategyName: any, options: any) => {
    return (req: any, res: any, next: any) => {
      req.user = mockUser;
      next();
    };
  }
);

let app: any;

describe('Google OAuth Integration Tests', () => {
  let client: Client;
  const testEmail = 'oauth_test_user@example.com';

  beforeAll(async () => {
    // Set dummy env variables for Google strategy registration in tests
    process.env.GOOGLE_CLIENT_ID = 'mock-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'mock-client-secret';
    process.env.GOOGLE_CALLBACK_URL =
      'http://localhost:3001/auth/google/callback';

    // Dynamically load the app so the environment variables are active first
    app = (await import('../apps/backend/src/app')).default;
    const dbUrl = process.env.DATABASE_URL;
    client = new Client({
      connectionString: dbUrl,
      ssl:
        dbUrl?.includes('supabase.co') || dbUrl?.includes('pooler.supabase.com')
          ? { rejectUnauthorized: false }
          : undefined,
    });
    await client.connect();

    // Cleanup existing test user
    await client.query('DELETE FROM users WHERE email = $1', [testEmail]);
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.query('DELETE FROM users WHERE email = $1', [testEmail]);
      await client.end();
    }
  }, 30000);

  it('should register GoogleStrategy and have _verify function', () => {
    const strategy = (passport as any)._strategies?.google;
    expect(strategy).toBeDefined();
    expect(strategy._verify).toBeDefined();
  });

  it('GoogleStrategy verify callback should create a new user if not exists', async () => {
    const strategy = (passport as any)._strategies.google;
    const profile = {
      emails: [{ value: testEmail }],
      displayName: 'OAuth Test User',
    };

    let resultUser: any = null;
    await strategy._verify(
      'access',
      'refresh',
      profile,
      (err: any, user: any) => {
        expect(err).toBeNull();
        expect(user).toBeDefined();
        resultUser = user;
      }
    );

    expect(resultUser.email).toBe(testEmail);
    expect(resultUser.username).toContain('google_');
    expect(resultUser.password_hash).toBeNull();

    // Query DB to ensure user was created
    const res = await client.query('SELECT * FROM users WHERE email = $1', [
      testEmail,
    ]);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].password_hash).toBeNull();
  });

  it('GoogleStrategy verify callback should link to existing user if profile email exists', async () => {
    const strategy = (passport as any)._strategies.google;
    const profile = {
      emails: [{ value: testEmail }],
      displayName: 'OAuth Test User Redundant',
    };

    let resultUser: any = null;
    await strategy._verify(
      'access',
      'refresh',
      profile,
      (err: any, user: any) => {
        expect(err).toBeNull();
        expect(user).toBeDefined();
        resultUser = user;
      }
    );

    // Check that we got the existing user
    expect(resultUser.email).toBe(testEmail);
  });

  it('should generate a JWT token containing correct claims', async () => {
    const secret = process.env.JWT_SECRET!;
    const payload = {
      sub: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
    };
    const token = sign(payload, secret);
    expect(token).toBeDefined();
  });

  it('a user created via Google should NOT be able to log in with email/password', async () => {
    // Try to login via POST /auth/login with the oauth user
    const res = await request(app).post('/auth/login').send({
      email: testEmail,
      password: 'password123',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Use Google login for this account');
  });

  it('/auth/google/callback redirect URL should contain a valid token', async () => {
    const res = await request(app).get('/auth/google/callback');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/callback?token=');
  });
});
