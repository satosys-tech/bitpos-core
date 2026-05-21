import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAccountAccess(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (idParam && req.auth!.accountId !== idParam) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

export function requireAccountAccessByParam(param: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const idParam = Array.isArray(req.params[param]) ? req.params[param][0] : req.params[param];
      if (idParam && req.auth!.accountId !== idParam) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next();
    });
  };
}
