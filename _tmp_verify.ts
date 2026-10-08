import { config } from "./config.js";
import { MessageStore } from "./store/messageStore.js";
import { connectToZaloMainPage } from "./history/cdp.js";
import { scrapeAndSaveTarget, waitForSidebarLoaded } from "./history/desktopScraper.js";
const store = new MessageStore();
const page = await connectToZaloMainPage(config.cdpUrl);
console.log("sinceTs =", new Date(config.sinceTs!).toISOString());
try {
    await waitForSidebarLoaded(page, 30_000);
    for (const t of ["LC_ChuVănAn_BTAN", "LC_QuangTrungNguyễnHuệ_Q5", "LC_HoaSen1_TĐ"]) await scrapeAndSaveTarget(page, store, t);
} finally { page.close(); }
