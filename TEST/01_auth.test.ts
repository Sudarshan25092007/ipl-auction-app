import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import {
  createUser,
  findUserByEmail,
  isEmailTaken,
} from '../apps/backend/src/db/queries/users';

describe('Auth DB Logic Tests', () => {
  const testEmail = 'test_hygiene_user@example.com';
  const testUsername = 'test_hygiene_user';
  const testPassword = 'mysecretpassword';

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

    // Clean up if the user already exists from a previous run
    await client.query('DELETE FROM users WHERE email = $1', [testEmail]);
  });

  afterAll(async () => {
    // Cleanup test user
    await client.query('DELETE FROM users WHERE email = $1', [testEmail]);
    await client.end();
  });

  it('should return false for isEmailTaken when email is free', async () => {
    const taken = await isEmailTaken(testEmail);
    expect(taken).toBe(false);
  });

  it('should successfully create a new user and retrieve it', async () => {
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const user = await createUser(testEmail, testUsername, passwordHash);
    expect(user).toBeDefined();
    expect(user.email).toBe(testEmail);
    expect(user.username).toBe(testUsername);
    expect(user.id).toBeDefined();

    const retrievedUser = await findUserByEmail(testEmail);
    expect(retrievedUser).toBeDefined();
    expect(retrievedUser?.id).toBe(user.id);
    expect(retrievedUser?.username).toBe(testUsername);

    const match = await bcrypt.compare(
      testPassword,
      retrievedUser!.password_hash!
    );
    expect(match).toBe(true);
  });

  it('should return true for isEmailTaken when email is taken', async () => {
    const taken = await isEmailTaken(testEmail);
    expect(taken).toBe(true);
  });
});
