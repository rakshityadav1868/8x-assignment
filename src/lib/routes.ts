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
    // --- Phase 5 ---
    settingsTab: (tab: "general" | "integrations" | "notifications" | "recording") => `/settings?tab=${tab}`,
    folder: (id: string) => `/folders/${id}`,
    record: "/record", // in-browser recorder + "Send Fanthom to a live meeting" bot panel
    calendar: "/calendar",
    insights: "/insights",
    trackers: "/trackers",
    tracker: (id: string) => `/trackers/${id}`,
    deals: "/deals",
    deal: (domain: string) => `/deals/${encodeURIComponent(domain)}`,
    team: "/team",
    welcome: "/welcome", // onboarding
    pricing: "/pricing", // marketing
    features: "/features", // marketing
    integrations: "/integrations", // marketing (config UI lives in settingsTab("integrations"))
    callComment: (id: string, commentId: string, ms: number) =>
      `/calls/${id}?t=${Math.floor(ms / 1000)}#comment-${commentId}`,
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

    // --- Phase 5 (contracts in contracts.ts "PHASE 5" section) ---
    // meetings: GET /api/meetings now accepts ListMeetingsQuery; PATCH meeting accepts folder_id/starred/deleted;
    // DELETE /api/meetings/:id = soft delete.
    meetingsBulk: "/api/meetings/bulk", // POST
    folders: "/api/folders", // GET, POST
    folder: (id: string) => `/api/folders/${id}`, // PATCH, DELETE
    folderMeetings: (id: string | "none") => `/api/folders/${id}/meetings`, // POST move
    coaching: (meetingId: string) => `/api/meetings/${meetingId}/coaching`, // GET
    meetingTrackers: (meetingId: string) => `/api/meetings/${meetingId}/trackers`, // GET
    insights: "/api/insights", // GET ?range&internal_only
    trackers: "/api/trackers", // GET, POST
    tracker: (id: string) => `/api/trackers/${id}`, // PATCH, DELETE
    trackerHits: (id: string) => `/api/trackers/${id}/hits`, // GET ?meeting_id&limit
    deals: "/api/deals", // GET
    deal: (domain: string) => `/api/deals/${encodeURIComponent(domain)}`, // GET, PATCH
    comments: (meetingId: string) => `/api/meetings/${meetingId}/comments`, // GET, POST
    comment: (id: string) => `/api/comments/${id}`, // PATCH, DELETE
    reactions: (meetingId: string) => `/api/meetings/${meetingId}/reactions`, // GET
    segmentReactions: (segmentId: string) => `/api/segments/${segmentId}/reactions`, // POST toggle
    download: (meetingId: string, format: string, extra?: Record<string, string>) =>
      `/api/meetings/${meetingId}/download?${new URLSearchParams({ format, ...extra }).toString()}`, // GET (file)
    webhooks: "/api/integrations/webhooks", // GET, POST
    webhook: (id: string) => `/api/integrations/webhooks/${id}`, // PATCH, DELETE
    webhookTest: (id: string) => `/api/integrations/webhooks/${id}/test`, // POST
    webhookDeliveries: (id: string) => `/api/integrations/webhooks/${id}/deliveries`, // GET
    slack: "/api/integrations/slack", // GET, PUT
    slackTest: "/api/integrations/slack/test", // POST
    meetingSlack: (meetingId: string) => `/api/meetings/${meetingId}/slack`, // POST send recap
    crm: (meetingId: string) => `/api/meetings/${meetingId}/crm`, // GET ?provider preview, POST sync
    crmLogs: "/api/integrations/crm/logs", // GET ?meeting_id
    emailRecap: (meetingId: string) => `/api/meetings/${meetingId}/email-recap`, // POST preview
    bots: "/api/bots", // GET, POST
    bot: (id: string) => `/api/bots/${id}`, // GET
    botAdvance: (id: string) => `/api/bots/${id}/advance`, // POST
    calendar: "/api/calendar", // GET ?from&to
    calendarEvent: (eventId: string) => `/api/calendar/${eventId}`, // PATCH {record}
    prefs: "/api/prefs", // GET, PATCH
    me: "/api/me", // GET
    team: "/api/team", // GET
    teamInvite: "/api/team/invite", // POST
    teamMember: (id: string) => `/api/team/${id}`, // PATCH, DELETE
    notifications: "/api/notifications", // GET ?unread&limit
    notificationsRead: "/api/notifications/read", // POST
  },
} as const;
