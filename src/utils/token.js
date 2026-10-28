import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generates a signed JWT Access Token
 * @param {{ id: number|string, role: string }} user
 * @returns {string}
 */
export function generateAccessToken(user) {
  const payload = {
    id: Number(user.id),
    role: user.role,
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL || '15m',
  });
}

/**
 * Verifies a JWT Access Token
 * @param {string} token
 * @returns {{ id: number, role: string }}
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

/**
 * Generates a cryptographically secure random refresh token string
 * @returns {string}
 */
export function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Computes the SHA-256 hash of a token for secure database storage
 * @param {string} token
 * @returns {string} 64-character hexadecimal hash
 */
export function hashToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token string is required for hashing');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Returns cookie options matching security specifications
 * @param {boolean} isRefreshToken
 * @returns {import('express').CookieOptions}
 */
export function getCookieOptions(isRefreshToken = false) {
  const isProduction = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: isRefreshToken ? REFRESH_TOKEN_MAX_AGE_MS : ACCESS_TOKEN_MAX_AGE_MS,
  };
}

/**
 * Sets access_token and refresh_token HTTP-only cookies on the response
 * @param {import('express').Response} res
 * @param {string} accessToken
 * @param {string} [refreshToken]
 */
export function setAuthCookies(res, accessToken, refreshToken) {
  if (accessToken) {
    res.cookie('access_token', accessToken, getCookieOptions(false));
  }
  if (refreshToken) {
    res.cookie('refresh_token', refreshToken, getCookieOptions(true));
  }
}

/**
 * Clears access_token and refresh_token cookies on logout or session termination
 * @param {import('express').Response} res
 */
export function clearAuthCookies(res) {
  const isProduction = env.NODE_ENV === 'production';
  const clearOpts = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };

  res.clearCookie('access_token', clearOpts);
  res.clearCookie('refresh_token', clearOpts);
}

export default {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  getCookieOptions,
  setAuthCookies,
  clearAuthCookies,
};
