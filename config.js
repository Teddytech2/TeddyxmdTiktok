// Central configuration for TEDDY-XMD.
// Keep real credentials in Heroku Config Vars or a local .env file.
// Never commit real secrets to GitHub.
require("dotenv").config();
const crypto = require("crypto");

const isProduction = process.env.NODE_ENV === "production";

function required(name, value) {
  if (!value && isProduction) {
    throw new Error(`${name} is required. Set it in Heroku Config Vars.`);
  }
  return value || "";
}

const jwtSecret = required("JWT_SECRET", process.env.JWT_SECRET);
if (jwtSecret && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters.");
}

const mongoUri = required("MONGODB_URI", process.env.MONGODB_URI);

// Accept Heroku-generated secrets as well as a 64-character hexadecimal key.
// SHA-256 converts any sufficiently random secret into the 32 bytes AES-256 needs.
const encryptionSecret = required("TOKEN_ENCRYPTION_KEY", process.env.TOKEN_ENCRYPTION_KEY);
const tokenEncryptionKey = encryptionSecret
  ? ( /^[a-f0-9]{64}$/i.test(encryptionSecret)
      ? Buffer.from(encryptionSecret, "hex")
      : crypto.createHash("sha256").update(encryptionSecret, "utf8").digest() )
  : null;

module.exports = Object.freeze({
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,
  mongoUri,
  jwtSecret,
  tokenEncryptionKey,
  adminEmail: String(process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
  tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || "",
  tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET || "",
  tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI || ""
});
