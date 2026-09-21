/**
 * Route map + client-safe constants. Deliberately zod-free so client components can import it
 * without pulling the schema library into the browser bundle. Re-exported from `contracts.ts`.
 */

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export const ROUTES = {
  pages: {
    landing: "/", // marketing page
    calls: "/calls", // app home: My Calls
    call: (id: string) => `/calls/${id}`,
    callAt: (id: string, ms: number) => `/calls/${id}?t=${Math.floor(ms / 1000)}`,
    share: (token: string) => `/share/${token}`,
    clip: (token: string) => `/clip/${token}`,
    search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : "/search"),
    upload: "/upload",
    playlists: "/playlists",
    playlist: (id: string) => `/playlists/${id}`, // additive
    ask: "/ask", // cross-meeting Ask (additive)
    settings: "/settings",
  },
  api: {
    capabilities: "/api/capabilities", // GET
    meetings: "/api/meetings", // GET
    meeting: (id: string) => `/api/meetings/${id}`, // GET, PATCH
    upload: "/api/upload", // POST
    process: (id: string) => `/api/meetings/${id}/process`, // POST
    status: (id: string) => `/api/meetings/${id}/status`, // GET
    summary: (id: string) => `/api/meetings/${id}/summary`, // GET (?template&language), POST
    ask: (id: string) => `/api/meetings/${id}/ask`, // GET history, POST stream
    askGlobal: "/api/ask", // POST stream (P3)
    search: "/api/search", // GET ?q
    highlights: (meetingId: string) => `/api/meetings/${meetingId}/highlights`, // GET, POST
    highlight: (id: string) => `/api/highlights/${id}`, // PATCH, DELETE
    highlightShare: (id: string) => `/api/highlights/${id}/share`, // POST
    actionItems: (meetingId: string) => `/api/meetings/${meetingId}/action-items`, // POST
    actionItem: (id: string) => `/api/action-items/${id}`, // PATCH, DELETE
    share: (meetingId: string) => `/api/meetings/${meetingId}/share`, // POST, DELETE
    shareAccess: (token: string) => `/api/share/${token}`, // GET
    clip: (token: string) => `/api/clip/${token}`, // GET
    followUpEmail: (id: string) => `/api/meetings/${id}/follow-up-email`, // POST
    catchUp: (id: string) => `/api/meetings/${id}/catch-up`, // POST
    decisions: (id: string) => `/api/meetings/${id}/decisions`, // GET, POST
    commitments: (id: string) => `/api/meetings/${id}/commitments`, // POST
    segment: (id: string) => `/api/segments/${id}`, // PATCH (P3)
    playlists: "/api/playlists", // GET, POST
    playlistItems: (id: string) => `/api/playlists/${id}/items`, // POST
    playlist: (id: string) => `/api/playlists/${id}`, // GET (additive)
    playlistItem: (id: string, itemId: string) => `/api/playlists/${id}/items/${itemId}`, // DELETE (additive)
  },
} as const;
