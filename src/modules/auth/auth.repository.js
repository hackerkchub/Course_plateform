import { getPool } from '../../config/db.js';

export async function findUserById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, google_id, name, email, email_verified, avatar_url, phone, phone_verified, 
            role, status, last_login_at, created_at, updated_at, deleted_at 
     FROM users 
     WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] || null;
}

export async function findUserByGoogleId(googleId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, google_id, name, email, email_verified, avatar_url, phone, phone_verified, 
            role, status, last_login_at, created_at, updated_at, deleted_at 
     FROM users 
     WHERE google_id = ? AND deleted_at IS NULL`,
    [googleId]
  );
  return rows[0] || null;
}

export async function findUserByEmail(email) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, google_id, name, email, email_verified, avatar_url, phone, phone_verified, 
            role, status, last_login_at, created_at, updated_at, deleted_at 
     FROM users 
     WHERE email = ? AND deleted_at IS NULL`,
    [email]
  );
  return rows[0] || null;
}

export async function createUser({ google_id, name, email, email_verified = true, avatar_url = null, role = 'user', status = 'active' }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO users (google_id, name, email, email_verified, avatar_url, role, status, last_login_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [google_id, name, email, email_verified ? 1 : 0, avatar_url, role, status]
  );

  return findUserById(result.insertId);
}

export async function linkGoogleAccount(id, { google_id, avatar_url = null }) {
  const pool = getPool();
  await pool.query(
    `UPDATE users 
     SET google_id = ?, 
         avatar_url = COALESCE(avatar_url, ?), 
         email_verified = TRUE, 
         last_login_at = NOW() 
     WHERE id = ?`,
    [google_id, avatar_url, id]
  );

  return findUserById(id);
}

export async function updateLastLogin(id) {
  const pool = getPool();
  await pool.query(
    `UPDATE users SET last_login_at = NOW() WHERE id = ?`,
    [id]
  );
}

export async function updateUserProfile(id, { name, phone, phone_verified = false }) {
  const pool = getPool();
  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }

  if (phone !== undefined) {
    updates.push('phone = ?');
    params.push(phone);
    updates.push('phone_verified = ?');
    params.push(phone_verified ? 1 : 0);
  }

  if (updates.length === 0) {
    return findUserById(id);
  }

  params.push(id);
  await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  return findUserById(id);
}

export async function createRefreshToken({ user_id, token_hash, device_info = null, ip_address = null, expires_at }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at) 
     VALUES (?, ?, ?, ?, ?)`,
    [user_id, token_hash, device_info, ip_address, expires_at]
  );

  return result.insertId;
}

export async function findRefreshTokenByHash(tokenHash) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, user_id, token_hash, device_info, ip_address, expires_at, revoked_at, created_at 
     FROM refresh_tokens 
     WHERE token_hash = ?`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function revokeRefreshTokenById(id) {
  const pool = getPool();
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`,
    [id]
  );
}

export async function revokeRefreshTokenByHash(tokenHash) {
  const pool = getPool();
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL`,
    [tokenHash]
  );
}

export async function revokeAllUserTokens(userId) {
  const pool = getPool();
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}

export default {
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
};
