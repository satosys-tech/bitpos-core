import jwt from "jsonwebtoken";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const JWT_SECRET = process.env.SESSION_SECRET;
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
