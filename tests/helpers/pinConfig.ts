// Import this FIRST in a test file whose expectations are written for the documented default values.
// It sets the tunable sections of `config` to those defaults (src/config/configDoc.ts) before any module reads them, so the test
// checks the logic at the defaults no matter what is currently typed in config.ts.
import { config } from "../../config.js";
import { SETTINGS } from "../../src/config/configDoc.js";

const SECTIONS = ["watch.", "runner.", "recovery.", "chat.", "sessions.", "phases.", "total.", "print."];
for (const setting of SETTINGS) {
    if (setting.default === undefined || !SECTIONS.some((s) => setting.path.startsWith(s))) continue;
    const [section, key] = setting.path.split(".");
    (config as unknown as Record<string, Record<string, unknown>>)[section][key] = setting.default;
}
