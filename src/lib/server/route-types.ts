/** Route handler context with async params (Next.js 16). */
export type IdCtx = { params: Promise<{ id: string }> };
export type TokenCtx = { params: Promise<{ token: string }> };
