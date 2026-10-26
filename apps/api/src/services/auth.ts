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

function serializeSession(sessionId: string): string {
  return `${sessionId}.${signValue(sessionId)}`;
}

export function getSessionUserId(req: Pick<Request, 'headers'>): string | null {
  const cookieHeader = req.headers.cookie ?? '';

  const cookies = cookieHeader
    .split(';')
    .reduce<Record<string, string>>((acc, entry) => {
      const [name, ...rest] = entry.trim().split('=');

      if (name && rest.length > 0) {
        acc[name] = decodeURIComponent(rest.join('='));
      }

      return acc;
    }, {});

  const sessionValue = cookies[SESSION_COOKIE];

  if (!sessionValue) return null;

  const [sessionId, signature] = sessionValue.split('.');

  if (!sessionId || !signature) return null;

  const expectedSignature = signValue(sessionId);

  if (
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
  const sessionId = createUserSession(userId);
  const value = serializeSession(sessionId);

  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
  });

  return value;
}

export function clearSessionCookie(res: {
  clearCookie: (name: string, options?: Record<string, unknown>) => void;
}): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function generateGithubStateCookie(res: {
  cookie: (
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => void;
}): string {
  const value = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000;

  stateTokens.set(value, expiresAt);

  res.cookie(STATE_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
  });

  return value;
}

export function validateGithubState(
  req: Pick<Request, 'headers'>,
  submittedState?: string,
): boolean {
  const cookieHeader = req.headers.cookie ?? '';
  const cookies = cookieHeader
    .split(';')
    .reduce<Record<string, string>>((acc, entry) => {
      const [name, ...rest] = entry.trim().split('=');

      if (name && rest.length > 0) {
        acc[name] = decodeURIComponent(rest.join('='));
      }

      return acc;
    }, {});

  const cookieState = cookies[STATE_COOKIE];

  if (!cookieState || !submittedState) {
    return false;
  }

  const expiresAt = stateTokens.get(cookieState);

  if (!expiresAt || Date.now() > expiresAt) {
    stateTokens.delete(cookieState);
    return false;
  }

  return timingSafeEqual(Buffer.from(submittedState), Buffer.from(cookieState));
}

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
