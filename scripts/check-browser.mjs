import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.ATLAS_PLAYWRIGHT || "playwright");
const base = new URL("https://paldd.github.io/costa-rica-travel-atlas/");
const revision = process.env.ATLAS_REVISION || process.env.GITHUB_SHA;
assert.match(revision, /^[a-f0-9]{40}$/);

async function fetchReleaseFile(file) {
  const url = new URL(file, base);
  url.searchParams.set("revision", revision);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert(response.ok, url.href);
  return response.json();
}

const release = await fetchReleaseFile("release.json");
assert.equal(release.source_commit, revision);
const atlas = await fetchReleaseFile("atlas.json");
const records = new Map(atlas.records.map(record => [record.id, record]));

async function checkViewport(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    isMobile: width < 500,
    hasTouch: width < 500,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (new URL(response.url()).origin === base.origin && response.status() >= 400) {
      errors.push(response.status() + " " + response.url());
    }
  });
  await page.route("**/*", route => {
    if (new URL(route.request().url()).origin === base.origin) return route.continue();
    return route.abort();
  });

  const open = fragment => {
    const url = new URL(base);
    url.searchParams.set("revision", revision);
    url.hash = fragment;
    return page.goto(url.href, { waitUntil: "domcontentloaded" });
  };
  const heading = record => page.getByRole("heading", { level: 1, name: record.title, exact: true }).waitFor();
  const checkWidth = async () => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), page.url());
  };

  try {
    await open("catalog?q=Cloudbridge&material=photo");
    const filtered = page.locator(".route-card").filter({
      has: page.locator('h3 a[href*="place/cloudbridge"]'),
    });
    await filtered.first().locator(".activity-nature").waitFor();
    await checkWidth();

    const place = records.get("cloudbridge");
    await open("place/cloudbridge");
    await heading(place);
    const photo = place.dossier.photos[0];
    await page.waitForFunction(alt => Array.from(document.images).some(img => img.alt === alt && img.naturalWidth > 0), photo.alt);
    await page.locator('a[href="' + photo.licenseUrl + '"]').first().waitFor({ state: "attached" });
    const map = page.locator(".route-map");
    await map.locator(".leaflet-marker-icon").first().waitFor({ state: "attached" });
    const stop = map.locator(".route-map-stops li").first();
    await stop.locator("button").click();
    assert.equal(await stop.locator("button").getAttribute("aria-pressed"), "true");
    const pin = place.dossier.stops[0];
    const [lat, lng] = pin.coords;
    const expected = pin.source === "osm-cr-points"
      ? "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lng + "#map=16/" + lat + "/" + lng
      : atlas.sources[pin.source].url;
    assert.equal(await stop.getByRole("link", { name: "Источник координат" }).getAttribute("href"), expected);
    const download = page.waitForEvent("download");
    await map.getByRole("button", { name: /Скачать.*GPX/ }).click();
    const gpx = await readFile(await (await download).path(), "utf8");
    assert.equal((gpx.match(/<wpt /g) || []).length, place.dossier.stops.length);

    const clip = page.locator(".media-section li").filter({
      has: page.locator('a[href="https://www.youtube.com/watch?v=Q93OSbfF8BI"]'),
    });
    await clip.getByRole("button", { name: "Смотреть в карточке" }).click();
    await clip.locator('iframe[src="https://www.youtube-nocookie.com/embed/Q93OSbfF8BI"]').waitFor({ state: "attached" });
    await clip.getByRole("button", { name: "Свернуть плеер" }).click();
    assert.equal(await clip.locator("iframe").count(), 0);
    await checkWidth();

    const beach = records.get("playa-organos-paquera");
    const beachPhoto = beach.dossier.photos.find(item => item.file === "organos-paquera-atlas.jpg");
    assert(beachPhoto, "Playa Órganos is missing its credited photo");
    await open("place/" + beach.id);
    await heading(beach);
    await page.waitForFunction(alt => Array.from(document.images).some(img => img.alt === alt && img.naturalWidth > 0), beachPhoto.alt);
    await checkWidth();

    const fieldTrip = records.get("nicoya-bikepack-6");
    await open("expeditions?q=Nicoya&detail=track&material=video");
    const tripCard = page.locator(".route-card").filter({
      has: page.locator('h3 a[href*="place/nicoya-bikepack-6"]'),
    });
    await tripCard.getByRole("link", { name: fieldTrip.title }).click();
    await heading(fieldTrip);
    await page.waitForFunction(src => Array.from(document.images).some(img =>
      img.src.endsWith("/" + src) && img.naturalWidth > 0), fieldTrip.dossier.photos[0].file);
    await page.getByRole("list", { name: "Галереи и фотоотчёты" })
      .getByRole("link", { name: /BIKEPACKING.com · Nicoya Peninsula Traverse/ }).waitFor();
    const firstTripVideo = page.getByRole("list", { name: "Видео", exact: true }).locator("li").first();
    await firstTripVideo.getByRole("button", { name: "Смотреть в карточке" }).click();
    await firstTripVideo.locator('iframe[src="https://www.youtube-nocookie.com/embed/4JXi8OMG6Gc"]').waitFor();
    const fieldMap = page.getByRole("region", { name: "Карта маршрута" });
    const itineraryTrack = fieldMap.getByRole("link", { name: /карта перехода по Никое/ });
    await itineraryTrack.waitFor();
    assert.equal(await itineraryTrack.getAttribute("href"), "https://ridewithgps.com/routes/5717460");
    assert.equal(await fieldMap.locator(".route-map-stops li").count(), fieldTrip.dossier.stops.length);
    await checkWidth();

    const waterfall = records.get("oropendola-guachipelin-walk");
    await open("place/" + waterfall.id);
    await heading(waterfall);
    await page.waitForFunction(() => Array.from(document.images).some(img =>
      img.src.endsWith("/oropendola-guachipelin-commons.jpg") && img.naturalWidth > 0));
    const waterfallMap = page.getByRole("region", { name: "Карта маршрута" });
    const waterfallTrack = waterfallMap.getByRole("link", { name: /авторский трек к Оропендоле/ });
    await waterfallTrack.waitFor();
    assert.equal(await waterfallTrack.getAttribute("href"), atlas.sources[waterfall.dossier.track].url);
    assert.equal(await waterfallMap.locator(".route-map-stops li").count(), 3);
    await checkWidth();

    const trip = atlas.records.find(record => record.dossier.stageCover);
    await open("place/" + trip.id);
    await heading(trip);
    await page.locator(".detail-photo").getByText(/Остановка ·/).waitFor();
    const stage = page.locator(".stage-media");
    await stage.locator("summary").click();
    await stage.locator('a[href*="place/' + trip.dossier.stageCover.record + '"]').first().waitFor();
    await checkWidth();
    await open("sources");
    await page.getByText("Рейтинг Instagram и Facebook", { exact: true }).click();
    await page.getByRole("combobox", { name: "Материалы профиля" }).selectOption("publisher-pages");
    const readPages = page.locator(".profiles-list .publisher-read-pages").first();
    await readPages.locator("summary").click();
    const articleLink = readPages.getByRole("link").first();
    await articleLink.waitFor();
    assert.match(await articleLink.getAttribute("href"), /^https:\/\//);
    await checkWidth();

    const rioVista = records.get("pacuare-rio-vista-raft-zip-3");
    await open("place/" + rioVista.id);
    await heading(rioVista);
    await page.waitForFunction(() => Array.from(document.images).some(img =>
      img.src.endsWith("/pacuare-rafting-river-commons.jpg") && img.naturalWidth > 0));
    const lodgeVideo = page.getByRole("list", { name: "Видео", exact: true })
      .getByRole("link", { name: /видео о комнатах Rio Vista Lodge/ });
    await lodgeVideo.waitFor();
    assert.equal(await lodgeVideo.getAttribute("href"), "https://www.youtube.com/watch?v=_EQG_vyFaB0");
    await checkWidth();

    const localRide = records.get("senderos-rodeo-picagres-mtb-37");
    await open("catalog?q=Picagres");
    const localCard = page.locator(".route-card").filter({
      has: page.locator('h3 a[href*="senderos-rodeo-picagres-mtb-37"]'),
    });
    await localCard.locator(".route-preview").getByText("Схема точек").waitFor();
    assert.equal(await localCard.locator(".preview-plot polyline").count(), 0);
    assert.equal(await localCard.locator(".preview-plot circle").count(), localRide.dossier.stops.length);
    await localCard.getByRole("link", { name: localRide.title }).click();
    await heading(localRide);
    await page.getByRole("heading", { name: "Ориентиры на карте", exact: true }).waitFor();
    const localMap = page.getByRole("region", { name: "Карта маршрута" });
    const localTrack = atlas.sources[localRide.dossier.track].url;
    await localMap.locator('a[href="' + localTrack + '"]').waitFor();
    await page.getByRole("list", { name: "Галереи и фотоотчёты" }).getByRole("link", { name: /Senderos de Colón/ }).waitFor();
    await checkWidth();
    assert.deepEqual(errors, []);
    console.log(width + " px: catalog filters, credited photo, map, GPX, video, trip and publisher pages passed.");
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
try {
  for (const width of [1440, 393]) await checkViewport(browser, width);
} finally {
  await browser.close();
}
