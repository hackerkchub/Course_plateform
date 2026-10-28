import { OAuth2Client } from 'google-auth-library';
import { env } from './env.js';
import logger from './logger.js';

let client = null;
let mockVerifier = null;

function getClient() {
  if (!client) {
    client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }
  return client;
}

/**
 * Verifies a Google ID Token
 * Validates audience, issuer, expiration, and email_verified.
 * @param {string} idToken
 * @returns {Promise<{ google_id: string, email: string, name: string, avatar_url: string|null, email_verified: boolean }>}
 */
export async function verifyGoogleToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Google ID token is required');
  }

  // Support for injected mock verification in automated test environments
  if (mockVerifier) {
    return mockVerifier(idToken);
  }

  try {
    const oauthClient = getClient();
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid Google token payload');
    }

    // Issuer verification
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) {
      throw new Error(`Invalid token issuer: ${payload.iss}`);
    }

    // Audience verification
    if (payload.aud !== env.GOOGLE_CLIENT_ID) {
      throw new Error('Token audience does not match GOOGLE_CLIENT_ID');
    }

    // Expiration verification
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowInSeconds) {
      throw new Error('Google token has expired');
    }

    // Verified email check
    if (!payload.email_verified) {
      throw new Error('Google email is not verified');
    }

    const email = payload.email.toLowerCase().trim();
    const googleId = payload.sub;
    const name = payload.name || email.split('@')[0];
    const avatarUrl = payload.picture || null;

    return {
      google_id: googleId,
      email,
      name,
      avatar_url: avatarUrl,
      email_verified: true,
    };
  } catch (error) {
    logger.warn({ msg: 'Google ID token verification failed', error: error.message });
    throw error;
  }
}

/**
 * Sets a custom Google token verifier for testing
 * @param {Function|null} fn
 */
export function setGoogleTokenVerifierForTesting(fn) {
  mockVerifier = fn;
}

/**
 * Resets the Google token verifier back to default
 */
export function resetGoogleTokenVerifierForTesting() {
  mockVerifier = null;
}

export default {
  verifyGoogleToken,
  setGoogleTokenVerifierForTesting,
  resetGoogleTokenVerifierForTesting,
};
