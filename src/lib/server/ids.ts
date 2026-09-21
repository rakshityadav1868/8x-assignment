import { randomBytes, randomUUID } from "node:crypto";

export const newId = (prefix?: string) => (prefix ? `${prefix}_${randomUUID()}` : randomUUID());

/** URL-safe random token for share / clip links. */
export const newToken = (bytes = 12) => randomBytes(bytes).toString("base64url");

export const nowIso = () => new Date().toISOString();
