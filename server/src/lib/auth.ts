import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[bitpos] SESSION_SECRET is not set - using a randomly generated secret. " +
    "Sessions will be invalidated on every restart. Set SESSION_SECRET for persistence."
  );
}

const JWT_SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");
const ACCESS_EXPIRY = "1h";
const REFRESH_EXPIRY = "30d";

export interface JwtPayload {
  entityId: string;
  accountId: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, type: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded !== "object" || !decoded) throw new Error("Invalid token");
  return decoded as JwtPayload;
}
