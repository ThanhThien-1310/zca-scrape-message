/**
 * DOM selectors for the Zalo Desktop (Electron) app, confirmed by hand via
 * a live CDP probe against a real running instance — see the message id
 * format note below. Re-confirm after any Zalo Desktop update that changes
 * these class names.
 */
export const selectors = {
    /** Sidebar entry's display-name element, used to find a thread by name. */
    conversationTitle: ".conv-item-title__name",

    /** Sidebar entry (ancestor of conversationTitle) — click this to open the thread. */
    conversationItem: ".conv-item",

    /**
     * Display-name element of whichever sidebar entry is currently open —
     * the open item gets an extra `selected` class alongside `.conv-item`
     * (confirmed via src/cli/debug/active-conversation.ts). Used by the live
     * message observer to read which thread is actually open at the moment
     * a message renders, instead of trusting Node-side state that goes
     * stale the instant the user manually switches conversations.
     */
    activeConversationTitle: ".conv-item.selected .conv-item-title__name",

    /**
     * Sidebar's conversation search box — filters the sidebar down to
     * matching contacts/threads by name, independent of the "recently
     * active" window the unfiltered sidebar list otherwise renders (that
     * window is small and constantly reshuffled by other threads'
     * activity, so a target thread with no recent messages of its own can
     * simply not be present in the DOM at all — no amount of scrolling
     * reveals it, since it isn't in the underlying data either). Confirmed
     * live: typing a name here reliably surfaces that exact thread's
     * `.conv-item` regardless of how "recent" it is.
     */
    contactSearchInput: "#contact-search-input",

    /** One row = one message bubble in the open thread's message pane. */
    messageRow: ".chat-message",

    /** Sender display name within a row — absent on the account's own messages. */
    senderName: ".message-sender-name-content",

    /** Text content within a row. */
    messageContent: ".text-message__container",
};

/**
 * Each message row's `id` attribute is `bb_msg_id_<cliMsgId>` (a client-
 * generated id close to, but not exactly, the message's server `ts`) —
 * confirmed live. Superseded as the primary identity source by the row's
 * `[data-qid]` descendant(s), which carry Zalo's own real numeric message
 * id (see `extractRowsFromMessageSrc` in `src/scrape/desktopScraper.ts`); this
 * prefix is now only used as a fallback for a row with no `[data-qid]` at
 * all.
 */
export const messageIdPrefix = "bb_msg_id_";

