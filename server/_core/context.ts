import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserById } from "../db";
import { getCookie, LOCAL_DEMO_USER, readSession } from "../localAuth";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  if (
    ENV.localDemoMode &&
    opts.req.headers.cookie?.includes("uov-local-demo=1")
  ) {
    return { req: opts.req, res: opts.res, user: LOCAL_DEMO_USER as User };
  }
  const token = readSession(getCookie(opts.req));
  const user = token
    ? (await getUserById(token.userId)) ||
      (ENV.localDemoMode && token.userId === LOCAL_DEMO_USER.id
        ? (LOCAL_DEMO_USER as User)
        : null)
    : null;
  return { req: opts.req, res: opts.res, user };
}
