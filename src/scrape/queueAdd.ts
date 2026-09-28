import { stripDiacritics } from "../lesson/parseReport.js";

const tidy = (s: string): string => s.normalize("NFC").replace(/\s+/g, " ").trim();
const fold = (s: string): string => stripDiacritics(tidy(s)).toLowerCase();

/**
 * The name as written in `config.targets` that `input` refers to, or null. An exact match (ignoring surrounding and
 * repeated spaces) always wins; otherwise case and diacritics are forgiven, but only when exactly one target matches.
 */
export function resolveTargetName(input: string, targets: string[]): string | null {
    const wanted = tidy(input);
    const exact = targets.find((t) => tidy(t) === wanted);
    if (exact !== undefined) return exact;
    const matches = targets.filter((t) => fold(t) === fold(input));
    return matches.length === 1 ? matches[0] : null;
}

export type AddResult =
    | { name: string; status: "added" }
    | { name: string; status: "already-queued" }
    | { name: string; status: "unknown"; suggestions: string[] };

/** Targets that contain the typed text (or are contained in it), to help fix a typo. */
function suggest(input: string, targets: string[]): string[] {
    const f = fold(input);
    if (f === "") return [];
    return targets.filter((t) => fold(t).includes(f) || f.includes(fold(t)));
}

/**
 * Queues each named group for scraping through `enqueue` (returns false when it was already queued). Only names that
 * resolve to a `config.targets` entry are queued; the rest are reported as unknown, with suggestions.
 */
export function addTargets(inputs: string[], targets: string[], enqueue: (target: string) => boolean): AddResult[] {
    const seen = new Set<string>(); // the same group typed twice in one command is queued once
    return inputs.map((input): AddResult => {
        const name = resolveTargetName(input, targets);
        if (name === null) return { name: input, status: "unknown", suggestions: suggest(input, targets) };
        if (seen.has(name)) return { name, status: "already-queued" };
        seen.add(name);
        return { name, status: enqueue(name) ? "added" : "already-queued" };
    });
}
