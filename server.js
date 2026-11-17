const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");
const config = require("./config");

const app = express();
const PORT = config.port;
const COOKIE_NAME = "teddy_session";
const isProd = config.isProduction;

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });
const generalLimiter = rateLimit({ windowMs: 60 * 1000, limit: 100, standardHeaders: "draft-7", legacyHeaders: false });
app.use("/api/", generalLimiter);

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  preferences: {
    autoStoryView: { type: Boolean, default: false },
    autoStoryReact: { type: Boolean, default: false },
    autoLike: { type: Boolean, default: false }
  }
}, { timestamps: true });

const loginSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { timestamps: true });

const accountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  platform: { type: String, default: "tiktok" },
  displayName: String,
  openId: String,
  // Reserved for future approved OAuth integration. Never store TikTok passwords or raw browser cookies.
  accessTokenEncrypted: String,
  refreshTokenEncrypted: String,
  status: { type: String, enum: ["not_connected", "connected", "revoked"], default: "not_connected" }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const LoginSession = mongoose.model("LoginSession", loginSessionSchema);
const ConnectedAccount = mongoose.model("ConnectedAccount", accountSchema);

function encryptToken(value) {
  const key = config.tokenEncryptionKey;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(".");
}
function makeTokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function setCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: isProd, sameSite: "strict", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
}
function clearCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProd, sameSite: "strict", path: "/" });
}
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Please sign in." });
    const payload = jwt.verify(token, config.jwtSecret);
    const session = await LoginSession.findOne({ tokenHash: makeTokenHash(token), userId: payload.sub });
    if (!session) return res.status(401).json({ error: "Session expired. Please sign in again." });
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "Account not found." });
    req.user = user;
    next();
  } catch (_) { return res.status(401).json({ error: "Please sign in again." }); }
}
function publicUser(user) {
  return { id: user._id, email: user.email, role: user.role, preferences: user.preferences };
}

app.get("/api/health", (req, res) => res.json({ ok: true, service: "TEDDY-XMD TikTok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 10) return res.status(400).json({ error: "Password must be at least 10 characters." });
    if (await User.exists({ email })) return res.status(409).json({ error: "An account with that email already exists." });
    const passwordHash = await bcrypt.hash(password, 12);
    const adminEmail = String(config.adminEmail).trim().toLowerCase();
    const user = await User.create({ email, passwordHash, role: adminEmail && email === adminEmail ? "admin" : "user" });
    const token = jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: "7d" });
    await LoginSession.create({ userId: user._id, tokenHash: makeTokenHash(token), expiresAt: new Date(Date.now() + 7 * 86400000) });
    setCookie(res, token);
    res.status(201).json({ user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Could not create account." }); }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Email or password is incorrect." });
    const token = jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: "7d" });
    await LoginSession.create({ userId: user._id, tokenHash: makeTokenHash(token), expiresAt: new Date(Date.now() + 7 * 86400000) });
    setCookie(res, token);
    res.json({ user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Could not sign in." }); }
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (token) await LoginSession.deleteOne({ tokenHash: makeTokenHash(token) });
  clearCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, async (req, res) => {
  const accounts = await ConnectedAccount.find({ userId: req.user._id }).select("platform displayName status createdAt");
  res.json({ user: publicUser(req.user), accounts, integration: { tiktokOAuthConfigured: Boolean(config.tiktokClientKey && config.tiktokClientSecret && config.tiktokRedirectUri), automationAvailable: false } });
});

app.patch("/api/preferences", requireAuth, async (req, res) => {
  // These are saved user preferences only. No TikTok actions are executed by this starter.
  const allowed = ["autoStoryView", "autoStoryReact", "autoLike"];
  const updates = {};
  for (const key of allowed) if (typeof req.body[key] === "boolean") updates[`preferences.${key}`] = req.body[key];
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No valid preference supplied." });
  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true });
  res.json({ preferences: user.preferences, notice: "Preference saved. Automation is not active; TikTok integration and permission are not configured." });
});

app.get("/api/tiktok/status", requireAuth, async (req, res) => {
  const configured = Boolean(config.tiktokClientKey && config.tiktokClientSecret && config.tiktokRedirectUri);
  res.json({ configured, connected: false, message: configured ? "OAuth credentials are present, but the approved TikTok integration still needs to be implemented and reviewed." : "TikTok Developer credentials are not configured. You can use the website dashboard, but cannot connect an account yet." });
});

// This route deliberately does not accept TikTok passwords, browser cookies, or session dumps.
app.post("/api/tiktok/connect", requireAuth, (req, res) => {
  res.status(501).json({ error: "TikTok account linking is not active. Set up an approved TikTok Login Kit application first." });
});

app.get("/api/admin/overview", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  const [users, accounts] = await Promise.all([User.countDocuments(), ConnectedAccount.countDocuments()]);
  res.json({ users, accounts, automation: "inactive_until_approved_integration" });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

async function start() {
  if (!config.mongoUri) throw new Error("MONGODB_URI is required. Set it in Heroku Config Vars or your .env file.");
  if (!config.jwtSecret || config.jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
  await mongoose.connect(config.mongoUri);
  console.log("[TEDDY-XMD] MongoDB connected");
  app.listen(PORT, () => console.log(`[TEDDY-XMD] Listening on ${PORT}`));
}
start().catch(err => { console.error("[TEDDY-XMD] Startup failed:", err.message); process.exit(1); });
