# Course Platform Backend — Production Environment Template

**Document Version:** 1.0.0  
**Environment Target:** Production  
**Validation Engine:** Zod (`src/config/env.js`)  
**Security Warning:** Never commit real secrets, private keys, database passwords, or OAuth credentials to Git. Use this template to configure your production environment variables via AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets, or a secure `.env` file on the deployment target.

---

## 1. Production Configuration Template (`.env.production`)

```env
# ==============================================================================
# SERVER & RUNTIME CONFIGURATION
# ==============================================================================
# Port on which the Express HTTP server will listen
PORT=5000

# Runtime environment (must be strictly set to 'production')
NODE_ENV=production

# Public URL of the frontend client application (used for CORS and redirect validation)
# Example: https://learn.yourdomain.com
FRONTEND_URL=https://your-production-domain.com

# ==============================================================================
# DATABASE CONNECTION (MARIADB / MYSQL)
# ==============================================================================
# Hostname or IP address of the managed MariaDB / MySQL cluster
DB_HOST=your-db-host.internal

# Database port (default: 3306)
DB_PORT=3306

# Database user with DML and DDL permissions
DB_USER=course_platform_user

# High-entropy database password
DB_PASSWORD=REPLACE_WITH_STRONG_DB_PASSWORD

# Database name (Strictly enforced: must be course_platform_db in production)
DB_NAME=course_platform_db

# Maximum number of concurrent database connections in the connection pool
# Recommended: 20-50 for production depending on database instance size
DB_CONNECTION_LIMIT=20

# ==============================================================================
# JWT & SESSION SECURITY
# ==============================================================================
# Secret key used to sign short-lived access tokens (minimum 32 characters)
# Generate with: openssl rand -hex 32
JWT_ACCESS_SECRET=REPLACE_WITH_MINIMUM_64_CHAR_HEX_SECRET_openssl_rand_hex_32

# Secret key used to sign and verify long-lived refresh tokens (minimum 32 characters)
# Generate with: openssl rand -hex 32
JWT_REFRESH_SECRET=REPLACE_WITH_MINIMUM_64_CHAR_HEX_SECRET_openssl_rand_hex_32

# Access token time-to-live (e.g., 15m, 30m, 1h)
ACCESS_TOKEN_TTL=15m

# Refresh token time-to-live (e.g., 7d, 14d, 30d)
REFRESH_TOKEN_TTL=30d

# ==============================================================================
# GOOGLE OAUTH IDENTITY PROVIDER
# ==============================================================================
# Google OAuth 2.0 Web Client ID created in Google Cloud Console
# Example: 1234567890-abcdefgh.apps.googleusercontent.com
GOOGLE_CLIENT_ID=REPLACE_WITH_GOOGLE_CLIENT_ID.apps.googleusercontent.com

# ==============================================================================
# FILE STORAGE & ASSET MANAGEMENT
# ==============================================================================
# Relative or absolute path where uploaded files (images, documents) will be saved
# For Docker/Kubernetes, ensure this directory is mounted to persistent storage (EFS/PVC)
UPLOAD_DIR=uploads

# Maximum allowed file upload size in megabytes
MAX_UPLOAD_MB=10

# ==============================================================================
# INITIAL ADMINISTRATIVE PROVISIONING
# ==============================================================================
# Email address of the initial Super Administrator seeded into the database
# Used by `npm run seed` to grant super_admin privileges
SUPER_ADMIN_EMAIL=admin@your-production-domain.com
```

---

## 2. Environment Variable Reference & Security Guidelines

| Variable Name | Required | Default | Format / Constraints | Security Notes & Guidance |
|---|---|---|---|---|
| `PORT` | Optional | `5000` | Integer (1–65535) | The network port the server process binds to. In production behind a reverse proxy (Nginx/ALB), this typically remains 5000. |
| `NODE_ENV` | **Required** | `development` | `'production'` | Activates production security optimizations: HTTP-only secure cookies, Strict-Transport-Security, and NDJSON logging. |
| `FRONTEND_URL` | **Required** | `http://localhost:3000` | Valid HTTP/S URL | Enforces CORS protection. Only requests originating from this exact domain can exchange cookies and credentials. |
| `DB_HOST` | **Required** | `localhost` | Hostname / IP | Points to the private database server. Should always be an internal VPC endpoint in production. |
| `DB_PORT` | Optional | `3306` | Integer (1–65535) | Default MariaDB/MySQL port. |
| `DB_USER` | **Required** | `root` | Alphanumeric string | Application database user. Grant only necessary permissions (`SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX`). |
| `DB_PASSWORD` | **Required** | None | Secure string | Must be securely generated and protected. |
| `DB_NAME` | **Required** | `course_platform_db` | `course_platform_db` | **Enforced Guard:** The backend strictly forbids connection to any database other than `course_platform_db` in production. |
| `DB_CONNECTION_LIMIT`| Optional | `10` | Integer (1–100) | Sizing rule of thumb: `(Number of App Replicas * DB_CONNECTION_LIMIT) < Max MariaDB Connections`. |
| `JWT_ACCESS_SECRET` | **Required** | None | Min 32 chars | Cryptographic signing secret. Generate via `openssl rand -hex 32`. Never reuse across environments. |
| `JWT_REFRESH_SECRET` | **Required** | None | Min 32 chars | Cryptographic signing secret for refresh tokens. Generate via `openssl rand -hex 32`. |
| `ACCESS_TOKEN_TTL` | Optional | `15m` | String duration (`15m`) | Recommended: 15 minutes for maximum security. |
| `REFRESH_TOKEN_TTL`| Optional | `30d` | String duration (`30d`)| Period before users must re-authenticate with Google. Tokens rotate automatically on every refresh. |
| `GOOGLE_CLIENT_ID` | **Required** | None | Client ID string | Created under Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs. |
| `UPLOAD_DIR` | Optional | `uploads` | Directory path | Must have write permissions. If using containers, mount as persistent volume. |
| `MAX_UPLOAD_MB` | Optional | `10` | Number (MB) | Prevents denial-of-service via huge payload uploads. |
| `SUPER_ADMIN_EMAIL` | **Required** | None | Valid Email | Granted `super_admin` role when running initial database seed (`npm run seed`). |

---

## 3. Secret Generation Helper Commands

To generate secure cryptographic keys for production:

```bash
# Generate 64-character hex secret for JWT_ACCESS_SECRET
openssl rand -hex 32

# Generate 64-character hex secret for JWT_REFRESH_SECRET
openssl rand -hex 32

# Generate secure random password for Database
openssl rand -base64 24
```
