/**
 * Consecutive scroll rounds that revealed nothing new; the scroll loop stops at 3.
 * A null height (the message pane has nothing rendered — a conversation with no
 * messages) counts as "no progress", otherwise such a conversation loops forever.
 */
export function nextStableRounds(height: number | null, previousHeight: number, stableRounds: number): number {
    return height === null || height === previousHeight ? stableRounds + 1 : 0;
}
