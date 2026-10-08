/** Chuẩn hóa tên để so khớp: bỏ dấu, `đ` thành `d`, chữ thường, mọi ký tự khác chữ và số thành một khoảng trắng, cắt hai đầu. */
export function normalizeName(s: string): string {
    return s
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function levenshtein(a: string, b: string): number {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const up = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = up;
        }
    }
    return prev[b.length];
}

/**
 * Gợi ý tên trong danh sách cho một tên KHÔNG khớp: cùng các từ khác thứ tự, thiếu chữ đệm (các từ của tên ngắn nằm trong tên dài, từ hai từ
 * trở lên), hoặc cách nhau tối đa 2 ký tự sau khi chuẩn hóa. Không bao giờ gợi ý tên đã khớp đúng (đó là khớp, không phải gợi ý).
 * Tối đa `max` tên, tốt nhất trước, mỗi tên một lần.
 */
export function suggestNames(name: string, roster: string[], max = 3): string[] {
    const target = normalizeName(name);
    if (target === "") return [];
    const tt = target.split(" ");
    const scored: Array<{ name: string; score: number }> = [];
    for (const cand of new Set(roster)) {
        const c = normalizeName(cand);
        if (c === "" || c === target) continue;
        const ct = c.split(" ");
        const sameWords = tt.length === ct.length && [...tt].sort().join(" ") === [...ct].sort().join(" ");
        const [small, big] = tt.length <= ct.length ? [tt, ct] : [ct, tt];
        const subset = small.length >= 2 && small.every((w) => big.includes(w));
        const dist = levenshtein(target, c);
        if (sameWords) scored.push({ name: cand, score: 0 });
        else if (subset) scored.push({ name: cand, score: 1 });
        else if (dist <= 2) scored.push({ name: cand, score: 1 + dist });
    }
    return scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, max).map((s) => s.name);
}
