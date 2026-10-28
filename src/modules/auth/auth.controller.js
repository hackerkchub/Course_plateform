import { sendSuccess, sendError } from '../../utils/response.js';
import { setAuthCookies, clearAuthCookies } from '../../utils/token.js';
import {
  loginWithGoogle,
  refreshTokens,
  logout as logoutService,
  logoutAll as logoutAllService,
  getCurrentUser,
  updateCurrentUser,
} from './auth.service.js';

export async function googleLogin(req, res, next) {
  try {
    const { id_token } = req.body;
    const clientInfo = {
      deviceInfo: req.headers['user-agent'] || null,
      ipAddress: req.ip || null,
    };

    const result = await loginWithGoogle(id_token, clientInfo);

    // Set secure HTTP-only cookies
    setAuthCookies(res, result.accessToken, result.refreshToken);

    return sendSuccess(res, 'Login successful', { user: result.user }, 200);
  } catch (error) {
    next(error);
  }
}

export async function refreshToken(req, res, next) {
  try {
    const rawRefreshToken = req.cookies?.refresh_token;
    if (!rawRefreshToken) {
      return sendError(res, 'Refresh token required', [], 401);
    }

    const clientInfo = {
      deviceInfo: req.headers['user-agent'] || null,
      ipAddress: req.ip || null,
    };

    try {
      const result = await refreshTokens(rawRefreshToken, clientInfo);
      setAuthCookies(res, result.accessToken, result.refreshToken);
      return sendSuccess(res, 'Token refreshed', {}, 200);
    } catch (err) {
      // Clear compromised/invalid cookies
      clearAuthCookies(res);
      throw err;
    }
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const rawRefreshToken = req.cookies?.refresh_token;
    await logoutService(rawRefreshToken);
    clearAuthCookies(res);
    return sendSuccess(res, 'Logged out successfully', {}, 200);
  } catch (error) {
    next(error);
  }
}

export async function logoutAll(req, res, next) {
  try {
    await logoutAllService(req.user.id);
    clearAuthCookies(res);
    return sendSuccess(res, 'Logged out from all devices', {}, 200);
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    const profile = await getCurrentUser(req.user.id);
    return sendSuccess(res, 'User profile retrieved', profile, 200);
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req, res, next) {
  try {
    const updatedProfile = await updateCurrentUser(req.user.id, req.body);
    return sendSuccess(res, 'Profile updated successfully', updatedProfile, 200);
  } catch (error) {
    next(error);
  }
}

export default {
  googleLogin,
  refreshToken,
  logout,
  logoutAll,
  getMe,
  updateMe,
};
