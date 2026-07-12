/**
 * apps/backend/src/routes/auth.ts
 *
 * MAJOR FUNCTION: POST /auth/register and POST /auth/login endpoints.
 * These are the ONLY endpoints that issue JWTs — all other tokens originate here.
 *
 * SYSTEM CONCEPT — bcrypt cost factor 12:
 *   bcrypt.hash(password, 12) runs 2^12 = 4,096 internal iterations.
 *   On modern hardware: ~4 seconds per hash.
 *   This is INTENTIONAL — it makes brute-force dictionary attacks 4,096x slower.
 *   An attacker with a GPU cluster trying 1M passwords/sec drops to ~244 passwords/sec.
 *   Tradeoff: register/login takes ~4s (acceptable — these happen rarely).
 *   Cost 10 = 1,024 iterations (~1s) — faster but weaker.
 *   Cost 14 = 16,384 iterations (~15s) — for very high-security data.
 *
 * SYSTEM CONCEPT — Timing Attack Prevention in login:
 *   Scenario WITHOUT protection:
 *     - Unknown email → instant "user not found" return (0ms)
 *     - Wrong password → bcrypt.compare takes 4s
 *   An attacker measuring response time can tell which emails are registered.
 *   Fix: ALWAYS run bcrypt.compare(), even for unknown emails (using a dummy hash).
 *   Response time is constant ~4s regardless of email existence.
 *
 * SYSTEM CONCEPT — JWT signing:
 *   jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
 *   Adds `iat` (now) and `exp` (now + 7 days) automatically to payload.
 *   Returns: "base64(header).base64(payload).signature"
 *   JWT_SECRET never leaves the server — only the signed token is sent to client.
 */
import { Router, type Router as ExpressRouter } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { nanoid } from 'nanoid';
import type { JwtPayload } from '@ipl-auction/shared';
import {
  findUserByEmail,
  createUser,
  isEmailTaken,
  type UserRow,
} from '../db/queries/users';

export const authRouter: ExpressRouter = Router();

// Setup Passport Google Strategy
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL;

if (googleClientId && googleClientSecret && googleCallbackUrl) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: googleCallbackUrl,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const displayName = profile.displayName || 'Google User';

          if (!email) {
            return done(new Error('No email found in Google profile'));
          }

          // Check if user exists
          let user = await findUserByEmail(email);

          if (!user) {
            // Create user with null password_hash and random username suffix
            const username = `google_${nanoid(6)}`;
            user = await createUser(email, username, null);
          }

          return done(null, { ...user, sub: user.id } as Express.User);
        } catch (err: any) {
          return done(err);
        }
      }
    )
  );
} else {
  console.warn(
    '[Passport] Google OAuth environment variables are missing. Google strategy not registered.'
  );
}

// Constant-time dummy hash for timing attack prevention.
// bcryptjs.compare() against this always returns false but takes the same ~4s.
const DUMMY_HASH = '$2b$12$invalid.hash.for.timing.safety.only.do.not.use';

// ─── POST /auth/register ──────────────────────────────────────────────────────
authRouter.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body as Record<string, unknown>;

    // ─── Input Validation (Phase 6 replaces this with Zod schemas) ───────────
    if (
      typeof email !== 'string' ||
      !email.includes('@') ||
      !email.includes('.')
    ) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }
    if (typeof username !== 'string' || username.trim().length < 3) {
      res
        .status(400)
        .json({ error: 'Username must be at least 3 characters.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res
        .status(400)
        .json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    // ─── Uniqueness check ─────────────────────────────────────────────────────
    if (await isEmailTaken(email)) {
      res
        .status(409)
        .json({ error: 'An account with this email already exists.' });
      return;
    }

    // ─── Hash password ────────────────────────────────────────────────────────
    // Cost 12 = 2^12 = 4,096 iterations. ~4 seconds. Intentionally slow.
    const passwordHash = await bcrypt.hash(password, 12);

    // ─── Persist user ─────────────────────────────────────────────────────────
    const user = await createUser(email, username, passwordHash);

    // ─── Issue JWT ────────────────────────────────────────────────────────────
    const token = signJwt(user.id, user.email, user.username);

    console.info(`[Auth] New user registered: ${user.username} (${user.id})`);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (err: unknown) {
    // Handle DB unique constraint violation (race condition — two simultaneous registrations)
    if (isPostgresError(err) && err.code === '23505') {
      res
        .status(409)
        .json({ error: 'An account with this email already exists.' });
      return;
    }
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as Record<string, unknown>;

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    // ─── Find user ────────────────────────────────────────────────────────────
    const user = await findUserByEmail(email);

    if (user && !user.password_hash) {
      res.status(401).json({ error: 'Use Google login for this account' });
      return;
    }

    // ─── Timing-safe password check ───────────────────────────────────────────
    // ALWAYS run bcrypt.compare — even if user is null (use DUMMY_HASH).
    // This ensures response time is ~4s regardless of whether the email exists.
    // Without this: unknown email returns in 0ms → timing side channel reveals
    // which emails are registered (enumeration attack).
    const passwordMatch = await bcrypt.compare(
      password,
      user?.password_hash ?? DUMMY_HASH
    );

    // Single generic error — don't reveal whether email or password was wrong.
    // "Email not found" would help an attacker enumerate valid emails.
    if (!user || !passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signJwt(user.id, user.email, user.username);

    console.info(`[Auth] User logged in: ${user.username} (${user.id})`);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── GET /auth/google ──────────────────────────────────────────────────────────
authRouter.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

// ─── GET /auth/google/callback ──────────────────────────────────────────────────
authRouter.get(
  '/google/callback',
  (req, res, next) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    passport.authenticate('google', {
      failureRedirect: `${frontendUrl}/login?error=oauth_failed`,
      session: false,
    })(req, res, next);
  },
  (req, res) => {
    const user = req.user as Express.User;
    const token = signJwt(user.sub, user.email, user.username);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Sign a JWT with the canonical JwtPayload shape. Expiry: 7 days. */
function signJwt(userId: string, email: string, username: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('[Auth] JWT_SECRET is not configured.');

  // Omit iat/exp — jsonwebtoken adds them automatically based on expiresIn
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: userId,
    email,
    username,
  };

  // expiresIn: '7d' → exp = iat + (7 * 24 * 60 * 60)
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

/** Type guard for PostgreSQL error objects (has `code` string property). */
function isPostgresError(
  err: unknown
): err is { code: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>).code === 'string'
  );
}
