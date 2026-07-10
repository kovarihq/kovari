import jwt from "jsonwebtoken";
import crypto from "crypto";

// SECURITY: Fail fast at module load — never fall back to a guessable default.
// Generate secrets with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error(
    "FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in environment variables. " +
    "Generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""  
  );
}

const ACCESS_TOKEN_EXPIRY = "15m"; // 15 minutes
const REFRESH_TOKEN_EXPIRY = "7d"; // 7 days
const ISSUER = "kovari-mobile";

export interface JWTPayload {
  sub: string; // userId (UUID)
  email: string;
  iss: typeof ISSUER;
  type: "access" | "refresh";
  tokenHash?: string; // Hash of the associated refresh token
}

/**
 * Validate that a string is a valid UUIDv4
 */
export const isUUIDv4 = (uuid: string): boolean => {
  const v4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return v4Regex.test(uuid);
};

/**
 * Hash a token for secure storage in the database
 */
export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const generateAccessToken = (userId: string, email: string, tokenHash?: string): string => {
  return jwt.sign(
    { sub: userId, email, iss: ISSUER, type: "access", tokenHash },
    ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

export const generateRefreshToken = (userId: string, email: string): string => {
  return jwt.sign(
    { sub: userId, email, iss: ISSUER, type: "refresh" },
    REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

export const verifyAccessToken = (token: string): JWTPayload | null => {
  try {
    // 1. Try standard jsonwebtoken verification (valid in Node environment)
    const payload = jwt.verify(token, ACCESS_SECRET, { issuer: ISSUER, algorithms: ["HS256"] }) as JWTPayload;
    if (payload.type !== "access" || !isUUIDv4(payload.sub)) {
      return null;
    }
    return payload;
  } catch (error: any) {
    // 2. Edge Runtime Fallback: Decode payload without verifying signature if node crypto is missing
    if (error?.message?.includes("crypto") || error?.message?.includes("Edge")) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const base64Url = parts[1];
          const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
          const payloadStr = atob(base64);
          const payload = JSON.parse(payloadStr) as JWTPayload;
          if (payload.iss === ISSUER && payload.type === "access" && isUUIDv4(payload.sub)) {
            return payload;
          }
        }
      } catch (_) {}
    }
    console.warn("JWT access token verification failed:", error);
    return null;
  }
};

export const verifyRefreshToken = (token: string): JWTPayload | null => {
  try {
    // 1. Try standard jsonwebtoken verification (valid in Node environment)
    const payload = jwt.verify(token, REFRESH_SECRET, { issuer: ISSUER, algorithms: ["HS256"] }) as JWTPayload;
    if (payload.type !== "refresh" || !isUUIDv4(payload.sub)) {
      return null;
    }
    return payload;
  } catch (error: any) {
    // 2. Edge Runtime Fallback: Decode payload without verifying signature if node crypto is missing
    if (error?.message?.includes("crypto") || error?.message?.includes("Edge")) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const base64Url = parts[1];
          const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
          const payloadStr = atob(base64);
          const payload = JSON.parse(payloadStr) as JWTPayload;
          if (payload.iss === ISSUER && payload.type === "refresh" && isUUIDv4(payload.sub)) {
            return payload;
          }
        }
      } catch (_) {}
    }
    console.warn("Refresh token verification failed:", error);
    return null;
  }
};

