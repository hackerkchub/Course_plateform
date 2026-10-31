# Course Platform Backend — GitHub Actions FTP/FTPS Deployment Setup Guide

**Document Version:** 1.0.0  
**Target Environment:** Production Hosting (cPanel / Managed Node.js / CloudLinux)  
**Workflow File:** `.github/workflows/deploy.yml`  
**Target Deployment Branch:** `main`  
**Protocol:** FTPS (FTP Secure over TLS) / Port 21  

---

## 1. Overview & Architecture

This guide describes how to configure automated continuous deployment for the Course Platform Backend (`d:\Course_plateform\backend\`) using GitHub Actions and secure FTPS file transfer.

### The Two-Stage Deployment Model
Deploying a Node.js backend over FTP/FTPS differs fundamentally from containerized deployments (like Docker or Kubernetes):

```
+-------------------------------------------------------------+
| STAGE 1: AUTOMATED (GitHub Actions Workflow)                |
| 1. Code pushed to 'main' branch                            |
| 2. GitHub Actions runner checks out repository             |
| 3. SamKirkland/FTP-Deploy-Action connects via FTPS (TLS)   |
| 4. Incremental sync transfers modified source files        |
| 5. Excluded files (.env, uploads, logs) are protected      |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
| STAGE 2: APPLICATION RUNTIME (cPanel / Server Operator)    |
| 1. Install new dependencies if package.json changed        |
|    (Via cPanel "Run NPM Install" or SSH terminal)           |
| 2. Restart Node.js application process                     |
|    (Via cPanel "Restart" button or touch tmp/restart.txt)  |
| 3. Apply database migrations if any (Manual npm run migrate)|
+-------------------------------------------------------------+
```

> [!IMPORTANT]
> **FTP is a file-transfer protocol, not an execution shell.**  
> FTP upload alone **does not** execute `npm install`, **does not** run database migrations, and **does not** restart the active Node.js server process. Stage 2 actions must be executed through the hosting control panel (cPanel) or authorized terminal access.

---

## 2. GitHub Repository Secrets Configuration

The deployment workflow references secure repository secrets. Never hardcode credentials into `.github/workflows/deploy.yml` or commit them to Git.

### 2.1 Navigation in GitHub

To add secrets to your repository:
1. Open your repository on GitHub: `https://github.com/hackerkchub/Course_plateform`
2. Click **Settings** in the top navigation tab bar.
3. In the left sidebar, expand **Secrets and variables** and select **Actions**.
4. Click the green button **New repository secret**.
5. Enter the **Name** and **Secret**, then click **Add secret**.

### 2.2 Required Secrets

| Secret Name | Required | Example Format | Purpose & Description |
|---|---|---|---|
| `FTP_SERVER` | **Yes** | `ftp.yourdomain.com` or `192.0.2.10` | The FTP host address provided by your hosting provider. |
| `FTP_USERNAME` | **Yes** | `deployer@yourdomain.com` | The FTP user account username. |
| `FTP_PASSWORD` | **Yes** | `ComplexPassword_#491` | The FTP user account password. |

### 2.3 Optional / Configurable Secrets

The workflow defines sensible production defaults for these settings, but you can override them via GitHub Secrets if your host uses non-standard configurations:

| Secret Name | Default Value | Recommended Usage | Description |
|---|---|---|---|
| `FTP_SERVER_DIR` | `./` | Dedicated account: `./`<br>Root/cPanel account: `course-platform-backend/` | Target folder on the remote server. **Must end with a trailing slash `/`**. |
| `FTP_PORT` | `21` | `21` (Standard FTPS)<br>`990` (Implicit FTPS) | Connection port. Standard FTP and Explicit FTPS both operate on port 21. |
| `FTP_PROTOCOL` | `ftps` | `ftps` (Explicit TLS)<br>`ftp` (Plain text fallback) | Encryption standard. Set to `ftps` for maximum security. |

---

## 3. Remote Directory Configuration & cPanel Directory Mapping

### 3.1 Understanding cPanel Directory Mapping

When an FTP account is created in cPanel, its root path determines what `./` means to the FTP client:

* **Scenario A: Dedicated FTP Account (Recommended)**  
  When creating the FTP account in cPanel (**cPanel → FTP Accounts**):
  - **Login:** `course-deployer`
  - **Domain:** `yourdomain.com`
  - **Directory:** Set this **directly to your application directory** (e.g. `course-platform-backend` or `public_html/api`).
  - **Result:** When the GitHub Actions workflow connects with this account, `./` points directly to the application directory.
  - **Configuration:** Set `FTP_SERVER_DIR` to `./` (or leave it unset to use the workflow default).

* **Scenario B: Primary cPanel Account / Home Directory Mapping**  
  If using the primary cPanel user or an FTP account rooted at `/home/username/`:
  - The application directory is a subdirectory inside the home directory (e.g. `/home/username/course-platform-backend`).
  - **Result:** The relative path from the FTP root to the app is `course-platform-backend/`.
  - **Configuration:** Add repository secret `FTP_SERVER_DIR` with value `course-platform-backend/` (must end with `/`).

> [!WARNING]
> **Never assume `/course-platform-backend/` is the correct path.**  
> An absolute leading slash (e.g., `/course-platform-backend/`) attempts to write to the root of the server filesystem, which shared hosting accounts are forbidden to access. Always use relative paths (`./` or `folder_name/`).

### 3.2 How to Verify the Remote Path in cPanel

1. Log into **cPanel**.
2. Click **Setup Node.js App** (or **Node.js Selector**).
3. Find your Course Platform application and note the field **Application root**.  
   *Example:* `course-platform-backend`
4. Go to **cPanel → FTP Accounts**.
5. Check the **Directory** assigned to your deployment FTP user.
6. Verify alignment:
   - If FTP Account Directory **matches** Application root → Use `server-dir: ./`.
   - If FTP Account Directory is **above** Application root → Set `FTP_SERVER_DIR` to the relative path between them.

---

## 4. Security Protocol (FTPS) Configuration

### 4.1 Explicit FTPS (Port 21)

The workflow is pre-configured with:
```yaml
protocol: ${{ secrets.FTP_PROTOCOL || 'ftps' }}
port: ${{ secrets.FTP_PORT || 21 }}
```

- **Explicit FTPS (`ftps`)** connects initially on port 21 and immediately issues an `AUTH TLS` command to upgrade the connection to encrypted TLS/SSL before transmitting credentials or files.
- This prevents eavesdropping and credential leakage across network hops.

### 4.2 Verifying FTPS Connectivity Locally

Before running the GitHub Action for the first time, verify that your hosting account supports FTPS:
1. Open an FTP client such as **FileZilla** or **WinSCP**.
2. Set **Host:** your `FTP_SERVER`.
3. Set **Encryption:** `Require explicit FTP over TLS`.
4. Set **Port:** `21`.
5. Enter your `FTP_USERNAME` and `FTP_PASSWORD`.
6. Click **Connect**. If a certificate prompt appears, accept it.
7. Verify that you can list files and create a test folder.

If your hosting provider strictly mandates unencrypted FTP, you can temporarily set secret `FTP_PROTOCOL` to `ftp`, but switching to an FTPS-capable host is strongly recommended.

---

## 5. Excluded Files & Safety Verification

### 5.1 The Exclude Rule Matrix

The workflow enforces a strict exclusion list:

```yaml
exclude: |
  **/.git*
  **/.git*/**
  **/.github/**
  **/node_modules/**
  **/.env
  **/.env*
  **/.env.*
  uploads/**
  logs/**
  coverage/**
  scratch/**
  tests/**
  **/*.log
  **/.DS_Store
  **/powershell.cmd
  **/*.tmp
  **/*.temp
```

| Exclusion Rule | Category | Protection Rationale |
|---|---|---|
| `**/.env`, `**/.env*`, `**/.env.*` | **Security / Secrets** | Prevents overwriting production database credentials, JWT secrets, and API keys with local development configuration. |
| `uploads/**` | **User Data Protection** | Ensures uploaded student files and media on disk are **never overwritten or deleted**. Note: Anchored to root so application code like `src/modules/uploads/**` is preserved. |
| `logs/**`, `**/*.log` | **Server Telemetry** | Protects active server log files from being modified or wiped out. |
| `**/node_modules/**` | **Performance / Binary Safety** | Prevents uploading thousands of Windows-compiled binaries that would break on Linux hosting. |
| `**/.git*`, `**/.github/**` | **Repository Metadata** | Internal VCS metadata not needed for Node.js execution. |
| `tests/**`, `coverage/**` | **Development Artifacts** | Test suites and test coverage files are not needed in production. |
| `scratch/**` | **Temporary Files** | Ad-hoc development inspection scripts are excluded from the server. |

### 5.2 Destructive Deletion Prevention

The workflow sets:
```yaml
dangerous-clean-slate: false
```
This guarantees that:
1. Existing files on the server (such as the server's `.env`, `uploads/`, `logs/`, and `node_modules/`) are never wiped prior to upload.
2. The deployment runs incrementally—only new or changed files from Git are synchronized.

---

## 6. Dependency Installation and Application Restart Procedures

FTP uploads files to the disk; the Node.js operating runtime is managed by Phusion Passenger (cPanel's Node.js engine). Follow these procedures after every deployment.

### 6.1 Installing Dependencies (`node_modules`)

When a commit changes `package.json` or `package-lock.json`:

#### Option A: Via cPanel Web Interface (No SSH needed)
1. Log into **cPanel**.
2. Navigate to **Software → Setup Node.js App**.
3. Click the **Edit** (pencil) icon next to your application.
4. Scroll to the **Detected configuration files** section.
5. Click the **Run NPM Install** button.
6. Wait for cPanel to display "NPM Install completed successfully".

#### Option B: Via cPanel Terminal or SSH
1. Open the cPanel **Terminal** or connect via SSH.
2. Activate the Node.js virtual environment using the command displayed at the top of the "Setup Node.js App" page:
   ```bash
   source /home/username/nodevenv/course-platform-backend/20/bin/activate
   ```
3. Navigate to the application root:
   ```bash
   cd /home/username/course-platform-backend
   ```
4. Install production dependencies:
   ```bash
   npm install --omit=dev
   ```

### 6.2 Restarting the Node.js Application

The active Node.js server holds the compiled code in memory. To load updated JavaScript files:

#### Option A: Via cPanel GUI
1. In **Setup Node.js App**, locate your application.
2. Click the **Restart** button (circular arrow icon).

#### Option B: File-Based Hot Restart (`tmp/restart.txt`)
Phusion Passenger watches for timestamp changes on `tmp/restart.txt`. When this file is touched, Passenger automatically restarts the application worker processes gracefully:

```bash
mkdir -p tmp && touch tmp/restart.txt
```

---

## 7. Database Migrations Policy

- **Frozen Migrations:** Migrations `001` through `008` are permanently frozen. Do not modify or re-run them.
- **No Automatic Migration Execution:** The deployment workflow does not execute database migrations automatically.
- **Future Migrations:** If a new schema migration (e.g., `009_...`) is added in the future:
  1. Verify the migration script locally against a staging database first.
  2. Access the server via cPanel Terminal or SSH.
  3. Execute migrations explicitly:
     ```bash
     npm run migrate
     ```
  4. Verify the database state using `npm run check-db`.

---

## 8. Verification and Troubleshooting Runbook

| Symptom / Error | Root Cause | Solution |
|---|---|---|
| **530 Login authentication failed** | Incorrect `FTP_USERNAME` or `FTP_PASSWORD`. | In cPanel, verify the full username (e.g. `user@domain.com` vs `user`). Reset the password in cPanel and update GitHub Secrets. |
| **550 No such file or directory** | Incorrect `server-dir` mapping. | Check whether the FTP user is mapped to the app root or cPanel home. Adjust `FTP_SERVER_DIR` in GitHub Secrets (e.g. `./` vs `app_folder/`). Must end with `/`. |
| **ETIMEDOUT / Connection timeout** | Hosting firewall is blocking GitHub Actions runner IP range on port 21 or passive port range. | Verify with host that FTP/FTPS passive port ranges (e.g. 49152–65535) are open, or request host whitelisting. |
| **SSL/TLS handshake failure** | Host certificate invalid or host does not support explicit FTPS on port 21. | Verify host certificate via FileZilla. If host does not support TLS, set GitHub Secret `FTP_PROTOCOL` to `ftp`. |
| **App serves old code after deploy** | Node.js process was not restarted. | Click **Restart** in cPanel "Setup Node.js App" or run `touch tmp/restart.txt`. |
| **500 Internal Server Error after deploy** | Missing dependencies or invalid `.env`. | Run **NPM Install** in cPanel. Check that `.env` contains all required variables listed in `docs/PRODUCTION_ENV_TEMPLATE.md`. |
| **Uploads missing or 404** | Accidental overwrite of `uploads/` directory. | Verified: Workflow excludes `**/uploads/**`, protecting disk-stored uploads. Ensure `UPLOAD_DIR` in `.env` matches the disk location. |

---

## 9. Pre-Deployment Readiness Checklist

Before pushing to `main` to trigger the first deployment:

- [ ] Repository secrets created in GitHub: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`.
- [ ] If directory mapping requires it, `FTP_SERVER_DIR` secret created (must end with `/`).
- [ ] Production `.env` file created directly on the hosting server (refer to `docs/PRODUCTION_ENV_TEMPLATE.md`).
- [ ] Application created in cPanel "Setup Node.js App" pointing to Node.js 18+ or 20+ with startup file `src/server.js`.
- [ ] FTPS tested using FileZilla or FTP client to confirm server address and credentials.
- [ ] MariaDB database `course_platform_db` created and verified with `npm run check-db`.
- [ ] Target branch confirmed as `main`.
