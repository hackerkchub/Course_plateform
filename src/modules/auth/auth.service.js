import { verifyGoogleToken } from '../../config/google.js';
import { env } from '../../config/env.js';
import logger from '../../config/logger.js';
import { AppError } from '../../middleware/errorHandler.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from '../../utils/token.js';
import {
  findUserById,
  findUserByGoogleId,
  findUserByEmail,
  createUser,
  linkGoogleAccount,
  updateLastLogin,
  updateUserProfile,
  createRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshTokenById,
  revokeRefreshTokenByHash,
  revokeAllUserTokens,
} from './auth.repository.js';

const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Format user for public/auth responses
 */
export function formatUserResponse(user) {
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    avatar_url: user.avatar_url,
    phone: user.phone,
    phone_verified: Boolean(user.phone_verified),
    role: user.role,
  };
}

/**
 * Format full profile response for GET /api/auth/me
 */
export function formatUserProfile(user) {
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    avatar_url: user.avatar_url,
    phone: user.phone,
    phone_verified: Boolean(user.phone_verified),
    role: user.role,
    status: user.status,
    created_at: user.created_at,
  };
}

/**
 * Login or register via Google ID token
 */
export async function loginWithGoogle(idToken, clientInfo = {}) {
  let googleClaims;
  try {
    googleClaims = await verifyGoogleToken(idToken);
  } catch (err) {
    throw new AppError(err.message || 'Invalid or expired Google token', 400);
  }

  const { google_id, email, name, avatar_url, email_verified } = googleClaims;

  if (!email_verified) {
    throw new AppError('Google account email is not verified', 400);
  }

  // 1. Look up existing user by google_id
  let user = await findUserByGoogleId(google_id);

  if (user) {
    // Check if account is blocked
    if (user.status === 'blocked') {
      logger.warn({ msg: 'Blocked user attempted Google login', userId: user.id, email: user.email });
      throw new AppError('Your account has been blocked. Please contact support.', 403);
    }

    await updateLastLogin(user.id);
  } else {
    // 2. Look up by email if google_id wasn't matched yet
    const existingByEmail = await findUserByEmail(email);

    if (existingByEmail) {
      if (existingByEmail.google_id && existingByEmail.google_id !== google_id) {
        throw new AppError('This email is already associated with a different Google account', 409);
      }

      if (existingByEmail.status === 'blocked') {
        logger.warn({ msg: 'Blocked pre-provisioned user attempted Google login', userId: existingByEmail.id, email });
        throw new AppError('Your account has been blocked. Please contact support.', 403);
      }

      // Safe linking for pre-provisioned staff or super-admin accounts
      // PRESERVES existing database role! Client or Google cannot change role.
      user = await linkGoogleAccount(existingByEmail.id, {
        google_id,
        avatar_url,
      });

      logger.info({
        msg: 'Successfully linked Google account to existing user',
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    } else {
      // 3. Auto-provision new user
      const isSuperAdminEmail = email === env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
      const initialRole = isSuperAdminEmail ? 'super_admin' : 'user';

      user = await createUser({
        google_id,
        name,
        email,
        email_verified: true,
        avatar_url,
        role: initialRole,
        status: 'active',
      });

      logger.info({
        msg: 'New user registered via Google OAuth',
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    }
  }

  // Generate token pair
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await createRefreshToken({
    user_id: user.id,
    token_hash: tokenHash,
    device_info: clientInfo.deviceInfo || null,
    ip_address: clientInfo.ipAddress || null,
    expires_at: expiresAt,
  });

  return {
    user: formatUserResponse(user),
    accessToken,
    refreshToken,
  };
}

/**
 * Rotate refresh token and issue a fresh access token
 */
export async function refreshTokens(rawRefreshToken, clientInfo = {}) {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    throw new AppError('Refresh token is required', 401);
  }

  const tokenHash = hashToken(rawRefreshToken);
  const tokenRecord = await findRefreshTokenByHash(tokenHash);

  if (!tokenRecord) {
    throw new AppError('Invalid refresh token', 401);
  }

  // REPLAY ATTACK DETECTION
  // If the token was already revoked, a compromised/replayed token is being used!
  if (tokenRecord.revoked_at !== null) {
    logger.warn({
      msg: '🚨 SECURITY ALERT: Refresh token replay attack detected! Revoking all sessions for user.',
      userId: tokenRecord.user_id,
      tokenId: tokenRecord.id,
    });

    // Revoke all tokens for this user across all devices
    await revokeAllUserTokens(tokenRecord.user_id);
    throw new AppError('Token reuse detected. All sessions have been revoked. Please log in again.', 401);
  }

  // EXPIRATION CHECK
  if (new Date(tokenRecord.expires_at) < new Date()) {
    await revokeRefreshTokenById(tokenRecord.id);
    throw new AppError('Refresh token has expired. Please log in again.', 401);
  }

  // USER STATUS CHECK
  const user = await findUserById(tokenRecord.user_id);
  if (!user || user.status === 'blocked') {
    await revokeRefreshTokenById(tokenRecord.id);
    throw new AppError('User account is inactive or blocked', 401);
  }

  // ROTATION:
  // 1. Revoke the old refresh token
  await revokeRefreshTokenById(tokenRecord.id);

  // 2. Generate new token pair
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashToken(newRefreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  // 3. Store new token hash in database
  await createRefreshToken({
    user_id: user.id,
    token_hash: newTokenHash,
    device_info: clientInfo.deviceInfo || tokenRecord.device_info,
    ip_address: clientInfo.ipAddress || tokenRecord.ip_address,
    expires_at: expiresAt,
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Logout current session by revoking the refresh token
 */
export async function logout(rawRefreshToken) {
  if (rawRefreshToken && typeof rawRefreshToken === 'string') {
    const tokenHash = hashToken(rawRefreshToken);
    await revokeRefreshTokenByHash(tokenHash);
  }
}

/**
 * Logout all sessions for a user across all devices
 */
export async function logoutAll(userId) {
  if (!userId) {
    throw new AppError('User ID is required for logout-all', 400);
  }
  await revokeAllUserTokens(userId);
}

/**
 * Fetch current user profile
 */
export async function getCurrentUser(userId) {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.status === 'blocked') {
    throw new AppError('Your account has been blocked', 403);
  }

  return formatUserProfile(user);
}

/**
 * Update current user profile
 * (Only name and phone can be updated. Changing phone resets phone_verified to false)
 */
export async function updateCurrentUser(userId, updateData = {}) {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.status === 'blocked') {
    throw new AppError('Your account has been blocked', 403);
  }

  const payload = {};
  if (updateData.name !== undefined) {
    payload.name = updateData.name;
  }

  if (updateData.phone !== undefined) {
    payload.phone = updateData.phone;
    // Section 6: "Phone badalne par phone_verified = false"
    payload.phone_verified = false;
  }

  const updatedUser = await updateUserProfile(userId, payload);
  return formatUserProfile(updatedUser);
}

export default {
  loginWithGoogle,
  refreshTokens,
  logout,
  logoutAll,
  getCurrentUser,
  updateCurrentUser,
  formatUserResponse,
  formatUserProfile,
};
