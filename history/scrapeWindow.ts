/**
 * The upper bound of a scrape. `override` `undefined` means "use the configured `config.untilTs`" (manual `bot:scrape`);
 * an explicit `null` or number replaces it. `bot:runner` and recovery pass `null`: they must collect everything up to
 * now, whatever `untilTs` says (it exists to pin a window for a manual run, e.g. noon).
 */
export function resolveUntilTs(override: number | null | undefined, configured: number | null): number | null {
    return override === undefined ? configured : override;
}
