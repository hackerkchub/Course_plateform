# Temporary Local Google OAuth Manual Testing Harness

> **WARNING**: This directory is strictly for local development and manual verification.  
> Never deploy or serve this in a production environment.  
> Delete this entire directory (`manual-test/`) once testing is completed.

---

## 1. Purpose

This test harness uses Google's official **Google Identity Services (GIS)** JavaScript library to render an authentic Google Sign-In button on a local web page. It allows you to:
1. Sign in with your real Google test account.
2. Receive an authentic Google ID token (`response.credential`).
3. Display and copy the ID token directly in your browser without logging or sending it to any third-party server.
4. Paste the ID token into Postman to test `POST /api/auth/google`.
5. Preview decoded token claims (`email`, `email_verified`, `sub`, `aud`, `exp`) directly on the page.

---

## 2. Google Cloud Console Configuration

Google Identity Services requires the exact HTTP origin to be registered under **Authorized JavaScript origins**.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project.
3. Navigate to **APIs & Services** → **Credentials**.
4. Click on your **OAuth 2.0 Client ID** (Web application type).
5. Under **Authorized JavaScript origins**, click **+ ADD URI** and add:
   ```text
   http://localhost:3000
   ```
   *(Ensure there is **no trailing slash**)*
6. If you run the test harness on port 5500 instead, also add:
   ```text
   http://localhost:5500
   ```
7. Click **Save**. *(Note: Google Cloud Console changes may take 1 to 5 minutes to propagate).*

---

## 3. Audience Matching Requirement

The generated Google ID token contains an `aud` (Audience) claim that identifies which Google Client ID the token was minted for.

In the Course Platform backend ([`src/config/google.js`](../src/config/google.js)):
```javascript
if (payload.aud !== env.GOOGLE_CLIENT_ID) {
  throw new Error('Token audience does not match GOOGLE_CLIENT_ID');
}
```
**CRITICAL**: The Client ID used by this testing harness must match the `GOOGLE_CLIENT_ID` configured in your backend `.env` file. If they differ, the backend will correctly reject the token with a `400 Bad Request` (`Token audience does not match GOOGLE_CLIENT_ID`).

---

## 4. How to Run the Test Harness

### Step 1: Start the Backend Server (Terminal 1)
In `D:\Course_plateform\backend\`:
```bash
npm run dev
# Backend starts on http://localhost:5000
```

### Step 2: Start the Temporary Test Harness Server (Terminal 2)
In `D:\Course_plateform\backend\`:
```bash
node manual-test/server.js
# Test harness starts on http://localhost:3000
```

*(Optional: If port 3000 is busy, run with `TEST_HARNESS_PORT=5500 node manual-test/server.js` and ensure `http://localhost:5500` is in Authorized JavaScript origins).*

### Step 3: Open in Browser
Open:
```
http://localhost:3000
```

1. Verify that your `Google Client ID` is displayed in the input field.
2. Click **Sign in with Google**.
3. Select your Google test account in the popup.
4. The page will immediately reveal the **Google ID Token** and decoded claims (`email`, `email_verified: TRUE`, `sub`, `aud`, `exp`).

---

## 5. Testing with Postman

### Step 1: Click "Copy ID Token" on the test page.

### Step 2: In Postman, create a new request:
- **Method**: `POST`
- **URL**: `http://localhost:5000/api/auth/google`
- **Headers**:
  - `Content-Type: application/json`
- **Body** (`raw` JSON):
  ```json
  {
    "id_token": "<PASTE_YOUR_COPIED_TOKEN_HERE>"
  }
  ```

### Step 3: Click "Send".

### Expected Response (`200 OK`):
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "name": "Your Google Name",
      "email": "your_test_email@gmail.com",
      "avatar_url": "https://lh3.googleusercontent.com/...",
      "phone": null,
      "phone_verified": false,
      "role": "user"
    }
  }
}
```

### Verify Set-Cookie Headers in Postman:
Check the **Cookies** tab in Postman to confirm:
- `access_token`: HTTP-only cookie set (15m expiry).
- `refresh_token`: HTTP-only cookie set (30d expiry).

---

## 6. Security Guarantees of this Test Harness

- **No Storage**: Does not write to `localStorage`, `sessionStorage`, cookies, or files.
- **No Third-Party Transmission**: The ID token is never sent to any analytics, logging, or third-party servers.
- **No Secrets**: Contains zero Client Secrets or JWT secrets.
- **In-Memory Only**: A "Clear From Memory" button allows immediate zeroing out of the token from browser memory.

---

## 7. Cleanup Instructions

Once manual testing is complete, terminate the test server (`Ctrl+C` in Terminal 2) and delete this entire directory:

In PowerShell:
```powershell
Remove-Item -Recurse -Force D:\Course_plateform\backend\manual-test
```
