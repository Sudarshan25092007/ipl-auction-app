/**
 * apps/backend/src/middleware/auth.ts
 *
 * MAJOR FUNCTION: Express JWT guard middleware.
 * Validates `Authorization: Bearer <token>` header on every protected route.
 * Attaches decoded user to req.user for all downstream route handlers.
 * Short-circuits with 401 if token is invalid, expired, or missing.
 *
 * SYSTEM CONCEPT — Middleware as a security gate:
 *   Express middleware = (req, res, next) => void
 *   Calling next() passes control to the next handler (route proceeds).
 *   Calling res.status(401).json() short-circuits — route handler NEVER runs.
 *
 *   Register order matters:
 *     app.use('/rooms', jwtAuth, roomsRouter)
 *   jwtAuth runs first. If token invalid → 401 returned before roomsRouter sees request.
 *
 * SYSTEM CONCEPT — TypeScript Module Augmentation for req.user:
 *   Express.Request doesn't have a `.user` field by default.
 *   Doing `req.user = decoded` gives TypeScript error: "Property 'user' does not exist".
 *   Solution: declare global namespace Express and merge Request interface.
 *   This is NOT monkey-patching — it's TypeScript's official interface merging.
 *   After this declaration, `req.user` is typed as AuthenticatedUser everywhere.
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload, AuthenticatedUser } from '@ipl-auction/shared';

// ─── Module Augmentation ──────────────────────────────────────────────────────
// Merges `user` field into Express.Request globally — no casting in route handlers
declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}

/**
 * jwtAuth — Express middleware protecting any route it's registered on.
 *
 * Usage (single route):  router.get('/profile', jwtAuth, handler)
 * Usage (all routes):    app.use('/protected', jwtAuth)
 */
export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  // Must be: "Authorization: Bearer eyJ..."
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error:
        'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
    return;
  }

  const token = authHeader.slice(7); // Strip "Bearer " prefix (7 chars)

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // This should be caught at startup — if we reach here, it's a configuration bug
      throw new Error('JWT_SECRET environment variable is not set');
    }

    // jwt.verify() throws if:
    //   - Token is malformed (not 3 dot-separated base64 parts)
    //   - Signature doesn't match (tampered payload or wrong secret)
    //   - Token is expired (exp claim < current time)
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Attach to req — available to all downstream handlers as req.user.sub, req.user.username
    req.user = {
      sub: decoded.sub,
      email: decoded.email,
      username: decoded.username,
    };

    next(); // ✅ Token is valid — proceed to route handler
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      // Specific error — client needs to know to re-login (not just "invalid token")
      res.status(401).json({ error: 'Session expired. Please log in again.' });
    } else if (err instanceof jwt.JsonWebTokenError) {
      // Malformed or tampered token
      res.status(401).json({ error: 'Invalid token.' });
    } else {
      // Unexpected error (e.g. JWT_SECRET not configured)
      console.error('[Auth] Unexpected JWT verification error:', err);
      res.status(500).json({ error: 'Authentication service error.' });
    }
  }
}
