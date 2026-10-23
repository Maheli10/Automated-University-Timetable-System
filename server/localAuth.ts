import crypto from "node:crypto";
import type { Response } from "express";
import type { User } from "../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";

export const LOCAL_SESSION_COOKIE = "uov-local-session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const secret = () =>
  process.env.JWT_SECRET || "uov-development-secret-change-me";
export const LOCAL_DEMO_USER = {
  id: 1,
  openId: "admin@uov.local",
  name: "UOV Administrator",
  email: "admin@uov.local",
  passwordHash: null,
  mustChangePassword: 0,
  loginMethod: "local",
  role: "admin" as const,
  roleTitle: "Administrator",
  studentId: null,
  registrationNo: null,
  academicYear: null,
  phone: null,
  qualifications: null,
  staffCode: null,
  batch: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(),
};

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(
  password: string,
  stored: string | null | undefined
) {
  if (!stored) return false;
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex")
  );
}

function sign(payload: string) {
  return crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
}

export function createSession(user: Pick<User, "id" | "role">) {
  const payload = `${user.id}.${user.role}.${Date.now() + SESSION_TTL_SECONDS * 1000}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readSession(value?: string | null) {
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  if (sign(payload) !== signature) return null;
  const [id, role, expires] = payload.split(".");
  const userId = Number(id);
  if (!userId || !role || Number(expires) < Date.now()) return null;
  return { userId, role: role as User["role"] };
}

export function setSession(res: Response, user: Pick<User, "id" | "role">) {
  res.setHeader(
    "Set-Cookie",
    `${LOCAL_SESSION_COOKIE}=${createSession(user)}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
}

export function clearSession(res: Response, req?: any) {
  if (typeof (res as any).setHeader === "function") {
    const legacy = `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
    const local = `${LOCAL_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
    (res as any).setHeader("Set-Cookie", [legacy, local]);
  } else if (typeof (res as any).clearCookie === "function") {
    (res as any).clearCookie(COOKIE_NAME, {
      ...getSessionCookieOptions(req),
      maxAge: -1,
    });
  }
}

export function getCookie(req: { headers: { cookie?: string } }) {
  return (req.headers.cookie || "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(`${LOCAL_SESSION_COOKIE}=`))
    ?.slice(LOCAL_SESSION_COOKIE.length + 1);
}

export function publicUser(user: User) {
  const { passwordHash: _passwordHash, ...safe } = user as User & {
    passwordHash?: string | null;
  };
  return { ...safe, hasPassword: Boolean(_passwordHash) };
}
