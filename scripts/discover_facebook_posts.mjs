import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    rank: { type: "string", multiple: true },
    limit: { type: "string" },
    out: { type: "string", default: ".cache/facebook-guest-links.json" },
  },
});
const requested = new Set((values.rank || []).map(Number));
const limit = values.limit === undefined ? requested.size || 8 : Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("--limit must be between 1 and 100");
}
const atlas = JSON.parse(await readFile(new URL("../public/atlas.json", import.meta.url), "utf8"));
const pages = atlas.social.profiles.filter(profile => profile.platform === "Facebook");
if ([...requested].some(rank => !pages.some(profile => profile.rank === rank))) {
  throw new Error("Choose Facebook ranks from the published atlas");
}
const targets = pages
  .filter(profile => !requested.size || requested.has(profile.rank))
  .sort((a, b) => (a.postLinks?.length || 0) - (b.postLinks?.length || 0) || a.rank - b.rank)
  .slice(0, limit);

const { chromium } = createRequire(import.meta.url)(process.env.ATLAS_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ executablePath: process.env.ATLAS_CHROMIUM_EXECUTABLE });
const profiles = [];
let next = 0;
try {
  await Promise.all(Array.from({ length: Math.min(3, targets.length) }, async () => {
    const context = await browser.newContext({ locale: "es-CR" });
    await context.route("**/*", route => {
      const resource = route.request().resourceType();
      return ["image", "media", "font"].includes(resource) ? route.abort() : route.continue();
    });
    const page = await context.newPage();
    while (next < targets.length) {
      const target = targets[next++];
      const tabs = [];
      const candidates = new Set();
      for (const tab of ["posts", "reels", "videos"]) {
        try {
          const address = new URL(target.url);
          if (address.pathname === "/profile.php") address.searchParams.set("sk", tab);
          else address.pathname = address.pathname.replace(/\/$/, "") + "/" + tab + "/";
          const response = await page.goto(address.href, {
            waitUntil: "domcontentloaded",
            timeout: 14000,
          });
          const urls = await page.locator("a[href]").evaluateAll(links => links.flatMap(link => {
            if (!link.getClientRects().length || getComputedStyle(link).visibility === "hidden") return [];
            const url = new URL(link.href);
            const supported = ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"];
            if (url.protocol !== "https:" || !supported.includes(url.hostname)) return [];
            const path = url.pathname.replace(/\/$/, "");
            url.hash = "";
            if (/^\/(?:[^/]+\/)?(?:posts|videos|reel)\/[\w-]{5,}$/.test(path)) {
              url.search = "";
              return [url.href];
            }
            if (!/^\/(?:photo|story|permalink)(?:\.php)?$/.test(path)) return [];
            const params = new URLSearchParams();
            for (const key of ["id", "story_fbid", "fbid"]) {
              const value = url.searchParams.get(key);
              if (value && /^[\w-]{6,}$/.test(value)) params.set(key, value);
            }
            if (!params.has("fbid") && !params.has("story_fbid")) return [];
            url.pathname = path.endsWith(".php") ? path : path + ".php";
            url.search = params.toString();
            return [url.href];
          }));
          for (const url of urls) candidates.add(url);
          tabs.push({ tab, status: response?.status(), links: new Set(urls).size });
        } catch (error) {
          tabs.push({ tab, error: error.message.split("\n")[0] });
        }
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      const links = [...candidates];
      const direct = links.filter(url => /\/(?:posts|videos|reel)\//.test(url));
      const objects = links.filter(url => !direct.includes(url));
      profiles.push({ rank: target.rank, profile: target.url, tabs, candidates: [...direct, ...objects].slice(0, 8) });
    }
    await context.close();
  }));
} finally {
  await browser.close();
}
profiles.sort((a, b) => a.rank - b.rank);
const urls = [...new Set(profiles.flatMap(profile => profile.candidates))];
await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, JSON.stringify({ checkedUtc: new Date().toISOString(), profiles, urls }, null, 2) + "\n");
console.log(JSON.stringify({ checkedProfiles: profiles.length, withCandidateLinks: profiles.filter(p => p.candidates.length).length, urls: urls.length }));
