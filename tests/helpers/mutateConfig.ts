// Preload for tests/configIndependence.test.ts: runs BEFORE a test file and changes config values away from the defaults.
import { config } from "../../config.js";

// CONFIG_MUTATION=up moves every value above its default, anything else moves it below, so tests that hard-code a
// default fail in one direction or the other.
const up = process.env.CONFIG_MUTATION === "up";
config.sessions.chieuFromHour = up ? 13 : 11;
config.sessions.toiFromHour = up ? 19 : 17;
config.runner.quietSeconds = up ? 300 : 30;
config.runner.watchWarmupSeconds = up ? 120 : 45;
config.watch.minBlindSeconds = up ? 90 : 20;
config.chat.skipBackoffSeconds = up ? 90 : 30;
config.chat.echoWindowSeconds = up ? 300 : 60;
config.chat.sentLedgerMinutes = up ? 30 : 5;
config.recovery.marginMinutes = up ? 10 : 2;
