# TEDDY-XMD TikTok Dashboard

A Heroku-ready Node.js + Express + MongoDB website starter based on the requested TEDDY-XMD dark dashboard direction and the uploaded WhatsApp project as a structural reference.

## Included
- Email/password registration and login
- Password hashing with bcrypt
- HTTP-only, SameSite=Strict login cookie
- MongoDB user profiles and server-side login sessions
- Admin role assigned when the registering email matches `ADMIN_EMAIL`
- Per-user preference fields for Auto Story View, Auto Story React and Auto Like (saved settings only; not executed)
- Functional dashboard switches that save preferences through the authenticated API
- Dark responsive dashboard
- Heroku `Procfile`, `app.json`, Node engine declaration
- Reserved schema fields for future encrypted OAuth tokens

## Important feature status
The three controls now save each user’s preferences through the authenticated API. Saving a preference is not the same as performing a TikTok action. This release does **not** log into TikTok, detect new Stories, view Stories, react, or like content. TikTok’s current official developer documentation describes profile and video display APIs, but does not document endpoints for automatically detecting/viewing Stories or sending Story reactions. Therefore those two requested actions cannot be implemented as a supported Heroku-only server feature, with or without a developer account. A server also cannot control the TikTok app installed on a user’s phone. Do not ask users for TikTok passwords, raw browser cookies, or session dumps.

The uploaded ZIP is a WhatsApp/Baileys bot. Its WhatsApp event handlers and status/reaction APIs are not TikTok APIs, so they cannot be reused to execute TikTok actions. The project uses its general Node/Heroku/MongoDB approach rather than copying Baileys-specific code.

## Local setup
1. Install Node.js 20+ and MongoDB Atlas (or local MongoDB).
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI`.
4. Generate `JWT_SECRET` (at least 32 characters).
5. Generate a 32-byte encryption key:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
6. Set `TOKEN_ENCRYPTION_KEY` to the generated 64-character hex string.
7. Set `ADMIN_EMAIL` to the email that should receive admin role when it registers.
8. Run `npm install` then `npm start`.
9. Open `http://localhost:3000`.

## Heroku deployment
1. Create a Heroku app and connect this project repository.
2. In Settings -> Config Vars, set:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `TOKEN_ENCRYPTION_KEY`
   - `ADMIN_EMAIL` (optional)
   - `NODE_ENV=production`
3. Deploy. Heroku supplies `PORT` automatically.
4. Open the app URL and register using the configured `ADMIN_EMAIL` to create the admin account.

MongoDB Atlas must allow connections from the Heroku app. For production, use a strong unique database password and restrict network access as tightly as your hosting setup allows.

## Data model
- `User`: email, password hash, role, feature preferences
- `LoginSession`: hashed session token, expiry (TTL index)
- `ConnectedAccount`: platform, display name, open ID, encrypted access/refresh token fields reserved for approved OAuth

## Security notes
- Passwords are bcrypt-hashed.
- Login token is stored in an HTTP-only cookie and only its SHA-256 hash is stored in MongoDB.
- OAuth token encryption helper uses AES-256-GCM and requires `TOKEN_ENCRYPTION_KEY`.
- No TikTok passwords or browser cookies are collected.
- Add email verification, password reset, CSRF protection, audit logging, and a reviewed OAuth implementation before public commercial launch.

## API
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `PATCH /api/preferences` (stores preference only; does not execute actions)
- `GET /api/tiktok/status`
- `POST /api/tiktok/connect` (intentionally returns 501 until approved OAuth is implemented)
- `GET /api/admin/overview`
