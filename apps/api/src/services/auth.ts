import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const SESSION_COOKIE = 'vaultmap_session';
const STATE_COOKIE = 'vaultmap_github_state';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? 'development-session-secret';

interface UserSession {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

interface RepositoryGrant {
  installationId: number;
  repositoryId: number;
  repositoryOwner: string;
  repositoryName: string;
  grantedAt: number;
}

const sessions = new Map<string, UserSession>();
const repoGrantsByUser = new Map<string, RepositoryGrant[]>();
const stateTokens = new Map<string, number>();

function signValue(value: string): string {
  return createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, entry) => {
    const [name, ...rest] = entry.trim().split('=');
    if (name && rest.length > 0) {
      acc[name] = decodeURIComponent(rest.join('='));
    }
    return acc;
  }, {});
}

// ─── Stateless Session Tokens ───────────────────────────────────────────────

export function createSessionToken(userId: string): string {
  const payload = JSON.stringify({
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  const b64 = Buffer.from(payload).toString('base64url');
  const signature = signValue(b64);
  return `${b64}.${signature}`;
}

export function verifySessionToken(token?: string): string | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [b64, signature] = parts;
  const expectedSignature = signValue(b64);

  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(b64, 'base64url').toString('utf8'),
    ) as { userId?: string; expiresAt?: number };

    if (!payload.userId || typeof payload.userId !== 'string') return null;
    if (typeof payload.expiresAt === 'number' && Date.now() > payload.expiresAt) {
      return null;
    }

    return payload.userId;
  } catch {
    return null;
  }
}

// ─── Session Retrieval ───────────────────────────────────────────────────────

export function getSessionUserId(
  req: Pick<Request, 'headers'>,
): string | null {
  // 1. Authorization header: "Bearer <token>"
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const userId = verifySessionToken(token);
    if (userId) return userId;
  }

  // 2. Custom header: "X-VaultMap-Session: <token>"
  const customHeader = req.headers['x-vaultmap-session'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    const userId = verifySessionToken(customHeader.trim());
    if (userId) return userId;
  }

  // 3. Cookie: "vaultmap_session=<token>"
  const cookies = parseCookies(req.headers.cookie);
  const sessionValue = cookies[SESSION_COOKIE];

  if (!sessionValue) return null;

  // Try decoding signed session token first
  const tokenUserId = verifySessionToken(sessionValue);
  if (tokenUserId) return tokenUserId;

  // Fallback to legacy in-memory session (for existing or test sessions)
  const [sessionId, signature] = sessionValue.split('.');
  if (!sessionId || !signature) return null;

  const expectedSignature = signValue(sessionId);
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return session.userId;
}

export function requireAuthenticatedUser(
  req: Pick<Request, 'headers'>,
): string {
  const userId = getSessionUserId(req);

  if (!userId) {
    const error = new Error(
      'Authentication required for private repository access.',
    );
    Object.assign(error, { status: 401 });
    throw error;
  }

  return userId;
}

export function createUserSession(userId: string): string {
  const sessionId = randomBytes(24).toString('hex');
  const now = Date.now();

  sessions.set(sessionId, {
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });

  return sessionId;
}

export function setSessionCookie(
  res: {
    cookie: (
      name: string,
      value: string,
      options: Record<string, unknown>,
    ) => void;
  },
  userId: string,
): string {
  // Generate both the stateless signed token and in-memory session for compatibility
  const token = createSessionToken(userId);
  createUserSession(userId);

  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: SESSION_TTL_MS,
  });

  return token;
}

export function clearSessionCookie(res: {
  clearCookie: (name: string, options?: Record<string, unknown>) => void;
}): void {
  const isProduction = process.env.NODE_ENV === 'production';

  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
  });
}

// ─── GitHub OAuth State Handling ─────────────────────────────────────────────

export function generateGithubStateCookie(
  res: {
    cookie: (
      name: string,
      value: string,
      options: Record<string, unknown>,
    ) => void;
  },
  returnTo?: string,
): string {
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000;

  // Cryptographically signed stateless token
  const payload = JSON.stringify({
    nonce: randomBytes(16).toString('hex'),
    timestamp: now,
    returnTo: returnTo || '',
  });
  const b64 = Buffer.from(payload).toString('base64url');
  const signature = signValue(b64);
  const stateToken = `${b64}.${signature}`;

  // Also retain in memory map for legacy / tests
  stateTokens.set(stateToken, expiresAt);

  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(STATE_COOKIE, stateToken, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 15 * 60 * 1000,
  });

  return stateToken;
}

export function getStateReturnTo(submittedState?: string): string | null {
  if (!submittedState || typeof submittedState !== 'string') return null;

  const parts = submittedState.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString('utf8'),
    ) as { returnTo?: string };

    if (typeof payload.returnTo === 'string' && payload.returnTo.length > 0) {
      return payload.returnTo;
    }
  } catch {
    return null;
  }

  return null;
}

export function validateGithubState(
  req: Pick<Request, 'headers'>,
  submittedState?: string,
): boolean {
  if (!submittedState || typeof submittedState !== 'string') {
    return false;
  }

  // Path 1: Validate cryptographically signed stateless token
  const parts = submittedState.split('.');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const [b64, signature] = parts;
    const expectedSignature = signValue(b64);

    if (
      signature.length === expectedSignature.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      try {
        const payload = JSON.parse(
          Buffer.from(b64, 'base64url').toString('utf8'),
        ) as { timestamp?: number };

        if (
          payload.timestamp &&
          Date.now() - payload.timestamp < 15 * 60 * 1000
        ) {
          return true;
        }
      } catch {
        // Fall through to cookie check
      }
    }
  }

  // Path 2: Fallback to cookie and in-memory state map (for legacy tests/calls)
  const cookies = parseCookies(req.headers.cookie);
  const cookieState = cookies[STATE_COOKIE];

  if (!cookieState) {
    return false;
  }

  const expiresAt = stateTokens.get(cookieState);

  if (!expiresAt || Date.now() > expiresAt) {
    stateTokens.delete(cookieState);
    return false;
  }

  if (submittedState.length !== cookieState.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(submittedState), Buffer.from(cookieState));
}

// ─── Repository Grants ────────────────────────────────────────────────────────

export function listAuthorizedRepositories(userId: string): Array<{
  installationId: number;
  repositoryId: number;
  repositoryOwner: string;
  repositoryName: string;
}> {
  const grants = repoGrantsByUser.get(userId) ?? [];

  return grants.map((grant) => ({
    installationId: grant.installationId,
    repositoryId: grant.repositoryId,
    repositoryOwner: grant.repositoryOwner,
    repositoryName: grant.repositoryName,
  }));
}

export function setInstallationGrant(
  userId: string,
  installationId: number,
  repositoryIds: number[],
  repositoryOwner: string,
  repositoryName: string,
): void {
  const grants = repoGrantsByUser.get(userId) ?? [];

  const filtered = grants.filter(
    (grant) => grant.installationId !== installationId,
  );

  const normalized = repositoryIds.map((repositoryId) => ({
    installationId,
    repositoryId,
    repositoryOwner,
    repositoryName,
    grantedAt: Date.now(),
  }));

  repoGrantsByUser.set(userId, [...filtered, ...normalized]);
}

export function getInstallationGrantForRepository(
  userId: string,
  owner: string,
  name: string,
): { installationId: number; repositoryId: number } | null {
  const grants = repoGrantsByUser.get(userId) ?? [];
  const matching = grants.find(
    (grant) => grant.repositoryOwner === owner && grant.repositoryName === name,
  );

  if (!matching) return null;

  return {
    installationId: matching.installationId,
    repositoryId: matching.repositoryId,
  };
}

export function revokeInstallationForUser(
  userId: string,
  installationId: number,
): void {
  const grants = repoGrantsByUser.get(userId) ?? [];
  repoGrantsByUser.set(
    userId,
    grants.filter((grant) => grant.installationId !== installationId),
  );
}

export function hasInstallationAccess(
  userId: string,
  installationId: number,
  repositoryId: number,
): boolean {
  const grants = repoGrantsByUser.get(userId) ?? [];
  return grants.some(
    (grant) =>
      grant.installationId === installationId &&
      grant.repositoryId === repositoryId,
  );
}
