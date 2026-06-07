/**
 * auth.types.ts
 *
 * MAJOR FUNCTION: The shared JWT payload contract.
 *   Backend signs a token with this exact shape.
 *   Frontend decodes (not verifies) the token to read username/email for UI.
 *   Both sides reference ONE interface — no divergence possible.
 *
 * SYSTEM CONCEPT — JWT Structure (3 parts, dot-separated, base64url):
 *   header    = { alg: "HS256", typ: "JWT" }
 *   payload   = JwtPayload (this interface)
 *   signature = HMAC-SHA256(base64(header) + "." + base64(payload), JWT_SECRET)
 *
 *   The server VERIFIES by re-computing the signature.
 *   The frontend DECODES (reads base64 payload) without the secret — safe because
 *   the data is only as trusted as the server that signed it.
 *
 * DESIGN DECISION — `sub` (not `userId`):
 *   `sub` (subject) is an IANA-registered JWT standard claim for the principal.
 *   Using it signals to interviewers you understand JWT RFCs, not just the basics.
 *
 * DESIGN DECISION — 7-day expiry:
 *   This is a gaming app. An auction can run 30–90 minutes.
 *   A short 1-hour token would expire mid-game, disconnecting a live bidder.
 *   7 days is appropriate for low-risk, session-length game play.
 *   For financial systems: 15-minute access token + refresh token rotation.
 */

export interface JwtPayload {
  sub: string;      // user.id (UUID) — "who" this token belongs to
  email: string;
  username: string;
  iat: number;      // Issued At (Unix seconds) — auto-added by jsonwebtoken
  exp: number;      // Expiry (Unix seconds)    — auto-added when expiresIn: '7d' is passed
}

/**
 * The shape of req.user after the Express auth middleware runs.
 * Omits iat/exp — route handlers don't need timing info, just identity.
 * This type is merged into Express.Request via module augmentation in middleware/auth.ts.
 */
export type AuthenticatedUser = Pick<JwtPayload, 'sub' | 'email' | 'username'>;
