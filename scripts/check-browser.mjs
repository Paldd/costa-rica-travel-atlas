import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.ATLAS_PLAYWRIGHT || "playwright");
const base = new URL(process.env.ATLAS_BASE_URL || "https://paldd.github.io/costa-rica-travel-atlas/");
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
    const pendingPosts = atlas.social.publisherReview.nativeCandidates;
    if (pendingPosts.length) {
      const queue = page.locator("details.evidence-list").filter({ hasText: /^Публикации к сверке/ });
      await queue.locator("summary").click();
      const first = pendingPosts[0];
      await queue.locator(`a[href="${first.url}"]`).first().waitFor();
      assert(await queue.locator(`a[href="${first.article}"]`).count() > 0);
      assert.equal(await queue.locator(".source-directory > div").count(), pendingPosts.length);
    }
    await checkWidth();

    await open("catalog?q=School+Put-In&detail=route-map");
    const paddlingCard = page.locator(".route-card").filter({
      has: page.locator('h3 a[href*="place/pejibaye-school-own-packraft"]'),
    });
    const paddling = records.get("pejibaye-school-own-packraft");
    await paddlingCard.getByRole("link", { name: paddling.title }).click();
    await heading(paddling);
    await page.waitForFunction(() => Array.from(document.images).some(img =>
      img.src.endsWith("/pejivalle-landscape-commons.jpg") && img.naturalWidth > 0));
    await page.getByRole("region", { name: "Карта маршрута" })
      .getByRole("link", { name: /спуски, выходы и ориентиры Río Pejibaye/ }).waitFor();
    await checkWidth();

    const boca = records.get("boca-tapada-lodge-river-weekend-2");
    await open("place/" + boca.id);
    await heading(boca);
    const bocaMap = page.getByRole("region", { name: "Карта маршрута" });
    const roadDownload = page.waitForEvent("download");
    await bocaMap.getByRole("button", { name: "Скачать GPX", exact: true }).click();
    const roadGpx = await readFile(await (await roadDownload).path(), "utf8");
    assert.equal((roadGpx.match(/<trkpt /g) || []).length, atlas.lines[boca.dossier.line].coords.length);
    assert.equal((roadGpx.match(/<wpt /g) || []).length, boca.dossier.stops.length);
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

    const parkRoute = records.get("san-lorenzo-wildcamp-roof");
    const parkPoint = parkRoute.dossier.stops.find(stop => stop.point === "san-ramon-central-area");
    await open("place/" + parkRoute.id);
    await heading(parkRoute);
    await page.locator(".detail-photo figcaption").getByText(/Остановка · Центральный парк Сан-Рамона/).waitFor();
    const parkStop = page.locator(".route-map-stops li").filter({ hasText: parkPoint.name });
    await parkStop.locator(".point-photo-icon").waitFor();
    assert.equal(await parkStop.locator(".stop-photo").count(), 0);
    await parkStop.getByRole("button").click();
    const parkPhoto = parkStop.locator(".stop-photo");
    await parkPhoto.locator("img").scrollIntoViewIfNeeded();
    await page.waitForFunction(file => [...document.querySelectorAll(".stop-photo img")].some(
      photo => photo.src.endsWith("/" + file) && photo.naturalWidth > 0
    ), parkPoint.photo.file);
    assert.equal(await parkPhoto.getByRole("link", { name: parkPoint.photo.author }).getAttribute("href"), parkPoint.photo.original);
    assert.equal(await parkPhoto.getByRole("link", { name: parkPoint.photo.license }).getAttribute("href"), parkPoint.photo.licenseUrl);
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
    const exportText = async button => {
      const saving = page.waitForEvent("download");
      await button.click();
      return readFile(await (await saving).path(), "utf8");
    };
    const lake = records.get("laguna-rio-cuarto-paddle");
    const notice = lake.dossier.accessNotice;
    const noticeUrl = atlas.sources[notice.sources[0]].url;
    await open("catalog?q=Laguna+R%C3%ADo+Cuarto");
    const lakeCard = page.locator(".route-card").filter({ has: page.getByRole("link", { name: lake.title, exact: true }) });
    await lakeCard.locator(".access-notice").getByText(notice.title, { exact: true }).waitFor();
    await lakeCard.getByRole("link", { name: lake.title, exact: true }).click();
    await heading(lake);
    await page.locator(`.access-notice a[href="${noticeUrl}"]`).waitFor();
    await page.getByRole("button", { name: "Добавить в поездку" }).click();
    await page.getByRole("button", { name: "Открыть поездку" }).click();
    await page.locator(".trip-stop .access-notice").getByText(notice.title, { exact: true }).waitFor();
    const tripHtml = await exportText(page.getByRole("button", { name: "Скачать план" }));
    assert(tripHtml.includes(notice.text) && tripHtml.includes(noticeUrl));
    const tripGpx = await exportText(page.getByRole("button", { name: "Скачать GPX поездки" }));
    assert(tripGpx.includes(notice.title));
    await checkWidth();

    const huleWeekend = records.get("rio-cuarto-hule-2");
    await open("place/" + huleWeekend.id);
    await heading(huleWeekend);
    const huleMap = page.getByRole("region", { name: "Карта маршрута" });
    const stageSelect = huleMap.getByLabel("Участок на карте");
    const exportHule = huleMap.getByRole("button", { name: "Скачать GPX", exact: true });
    assert.equal((await exportText(exportHule)).match(/<trkseg>/g)?.length, 4);
    await stageSelect.selectOption("hule-public-downhill");
    const huleGpx = await exportText(exportHule);
    assert.equal(huleGpx.match(/<trkseg>/g)?.length, 1);
    assert.equal(huleGpx.match(/<trkpt /g)?.length, atlas.lines["hule-public-downhill"].coords.length);
    assert.equal(huleGpx.match(/<wpt /g)?.length, 2);
    await checkWidth();

    const canoe = records.get("penshurt-aviarios-buttercup-canoe");
    await open("catalog?activity=canoe&q=Aviarios");
    const canoeCard = page.locator(".route-card").filter({ has: page.getByRole("link", { name: canoe.title, exact: true }) });
    await canoeCard.getByText("Каноэ", { exact: true }).waitFor();
    await canoeCard.getByRole("link", { name: canoe.title, exact: true }).click();
    await heading(canoe);
    await page.waitForFunction(alt => Array.from(document.images).some(img =>
      img.alt === alt && img.naturalWidth > 0), canoe.dossier.photos[0].alt);
    await page.locator(".detail-photo figcaption").getByRole("link", { name: "CC BY-NC 2.0" }).waitFor();
    const canoeVideo = page.getByRole("list", { name: "Видео", exact: true }).getByRole("button", { name: "Смотреть в карточке" });
    await canoeVideo.click();
    assert.equal(await page.locator(".media-player").getAttribute("src"), "https://www.youtube-nocookie.com/embed/6pf_Ukxbc94");
    await checkWidth();

    const pozas = records.get("suerre-pozas-guacimo-camp-4x4");
    await open("place/" + pozas.id);
    await heading(pozas);
    await page.locator(".route-map .leaflet-overlay-pane path").first().waitFor();
    const pozasMap = page.getByRole("region", { name: "Карта маршрута" });
    const pozasGpx = await exportText(pozasMap.getByRole("button", { name: "Скачать GPX", exact: true }));
    assert.equal((pozasGpx.match(/<trkpt /g) || []).length, atlas.lines[pozas.dossier.line].coords.length);
    assert.equal((pozasGpx.match(/<wpt /g) || []).length, pozas.dossier.stops.length);
    await checkWidth();

    const toro = records.get("bajos-tesoro-dinoland-roof-2");
    await open("place/" + toro.id);
    await heading(toro);
    const toroMap = page.getByRole("region", { name: "Карта маршрута" });
    const toroStage = toroMap.getByLabel("Участок на карте");
    await toroStage.selectOption("tesoro-dinoland-drive-osm");
    const toroGpx = await exportText(toroMap.getByRole("button", { name: "Скачать GPX", exact: true }));
    assert.equal((toroGpx.match(/<trkseg>/g) || []).length, 1);
    assert.equal((toroGpx.match(/<trkpt /g) || []).length, atlas.lines["tesoro-dinoland-drive-osm"].coords.length);
    await page.getByRole("link", { name: "Сухие горки", exact: true }).click();
    const slides = page.locator(".route-card").filter({
      has: page.locator('h3 a[href*="place/dinoland-pura-vida-dry-slide"]'),
    });
    await slides.locator(".card-activity .activity-land svg").waitFor();
    await checkWidth();

    assert.deepEqual(errors, []);
    const roof = records.get("las-trillizas-roofcamp");
    await open("place/" + roof.id);
    await heading(roof);
    await page.waitForFunction(() => Array.from(document.images).some(img =>
      img.src.endsWith("/trillizas-roof-illustration.jpg") && img.naturalWidth > 0));
    await page.locator(".detail-photo figcaption").getByText("Иллюстрация снаряжения · ImageGen").waitFor();
    await page.locator(".route-map-stops button").last().waitFor();
    assert.equal(await page.locator(".route-map-stops button").count(), roof.dossier.stops.length);
    const roofClip = page.getByRole("list", { name: "Видео", exact: true }).locator("li")
      .filter({ has: page.locator('a[href*="GLr-xzs1mzQ"]') });
    assert.equal(await roofClip.locator(".media-poster").getAttribute("src"),
      "https://i.ytimg.com/vi/GLr-xzs1mzQ/mqdefault.jpg");
    await roofClip.getByRole("button", { name: "Смотреть в карточке" }).click();
    assert.equal(await page.locator(".media-player").getAttribute("src"), "https://www.youtube-nocookie.com/embed/GLr-xzs1mzQ");
    await checkWidth();

    const chiquita = records.get("talamanca-playa-chiquita-path");
    await open("place/" + chiquita.id);
    await heading(chiquita);
    await page.waitForFunction(() => Array.from(document.images).some(img =>
      img.src.endsWith("/playa-chiquita-velazquez.jpg") && img.naturalWidth > 0));
    await page.locator(".detail-photo figcaption").getByRole("link", { name: "Manuel Velazquez" }).waitFor();
    await checkWidth();

    const mosqueritos = records.get("mosqueritos-dota-lake-camp");
    await open("place/" + mosqueritos.id);
    await heading(mosqueritos);
    await page.locator(".route-map-stops button").last().waitFor();
    assert.equal(await page.locator(".route-map-stops button").count(), 2);
    await page.locator(".route-map .leaflet-overlay-pane path").first().waitFor();
    await checkWidth();

    const bocas = records.get("sixaola-bocas-colon-bastimentos-family-5");
    await open("expeditions?country=pa&region=bocas&duration=five&detail=line");
    await page.getByRole("link", { name: bocas.title, exact: true }).click();
    await heading(bocas);
    await page.waitForFunction(() => Array.from(document.images).some(img =>
      img.src.endsWith("/bocas-zapatilla.jpg") && img.naturalWidth > 0));
    const bocasMap = page.getByRole("region", { name: "Карта маршрута" });
    await bocasMap.getByLabel("Участок на карте").selectOption("bocas-lancha-osm");
    assert.equal(await bocasMap.locator(".route-map-stops li").count(), 2);
    assert.equal(await bocasMap.locator(".route-map-stops .activity-water svg").count(), 2);
    const boatPoints = await exportText(bocasMap.getByRole("button", { name: "Скачать точки GPX" }));
    assert.equal((boatPoints.match(/<wpt /g) || []).length, 2);
    assert(!boatPoints.includes("<trk>"));
    assert.equal(await bocasMap.getByRole("link", { name: /пассажирская линия на Колон/ }).getAttribute("href"),
      "https://www.openstreetmap.org/way/30741053");
    await checkWidth();

    const ferryBocas = records.get("bocas-almirante-isla-colon-car-ferry");
    await open("place/" + ferryBocas.id);
    await heading(ferryBocas);
    const vimeo = page.locator(".media-section li").filter({
      has: page.getByRole("link", { name: "Ferry Bocas · Viaja a Bocas en el Ferry", exact: true }),
    });
    await vimeo.getByRole("button", { name: "Смотреть в карточке" }).click();
    await vimeo.locator('iframe[src^="https://player.vimeo.com/video/226641308"]').waitFor({ state: "attached" });
    await checkWidth();

    await open("place/bocas-carenero-escuela-del-mar-surf");
    const carenero = page.locator(".media-section li").filter({
      has: page.getByRole("link", { name: "Momentos Pura Vida · сёрфинг у Каренеро", exact: true }),
    });
    await carenero.getByRole("button", { name: "Смотреть в карточке" }).click();
    await carenero.locator('video[src^="https://video.wixstatic.com/video/"][controls]').waitFor({ state: "attached" });
    await checkWidth();

    await open("place/monteverde-savia-ficus-nightfall");
    await page.getByRole("link", { name: "Hotel Belmar · Facebook", exact: true }).waitFor();
    await checkWidth();

    const dota = records.get("dota-coffee-poceron-glamping-2");
    await open("expeditions?region=mountains&activity=glamping&duration=two&detail=line");
    await page.getByRole("link", { name: dota.title, exact: true }).click();
    await heading(dota);
    await page.waitForFunction(() => Array.from(document.images).some(img =>
      img.src.endsWith("/outings-dota-hills.jpg") && img.naturalWidth > 0));
    const dotaMap = page.getByRole("region", { name: "Карта маршрута" });
    await dotaMap.getByLabel("Участок на карте").selectOption("dota-providencia-poceron-osm-road");
    const dotaGpx = await exportText(dotaMap.getByRole("button", { name: "Скачать GPX", exact: true }));
    assert.equal((dotaGpx.match(/<wpt /g) || []).length, 2);
    assert.equal((dotaGpx.match(/<trkpt /g) || []).length, atlas.lines["dota-providencia-poceron-osm-road"].coords.length);
    await checkWidth();

    await open("place/mastatal-salto-el-indio-7");
    await page.getByText("Частный проход с местной командой", { exact: true }).waitFor();
    const indioMap = page.getByRole("region", { name: "Карта маршрута" });
    const indioGpx = await exportText(indioMap.getByRole("button", { name: "Скачать точки GPX" }));
    assert.equal((indioGpx.match(/<wpt /g) || []).length, 1);
    assert(!indioGpx.includes("<trk>"));
    await checkWidth();

    await open("place/uvita-kura-adults-forest-bay");
    const kuraPosts = page.getByRole("link", { name: "Kurà Boutique Hotel · Instagram", exact: true });
    await kuraPosts.first().waitFor();
    assert.equal(await kuraPosts.count(), 3);
    await checkWidth();

    const riverTrip = records.get("tablillas-solentiname-el-castillo-7");
    await open("expeditions?country=ni&region=rio-san-juan&duration=seven&activity=border");
    await page.getByRole("link", { name: riverTrip.title, exact: true }).click();
    await heading(riverTrip);
    await page.waitForFunction(() => Array.from(document.images).some(img =>
      img.src.endsWith("/riosanjuan-solentiname-lake.jpg") && img.naturalWidth > 0));
    const sanJuanMap = page.getByRole("region", { name: "Карта маршрута" });
    await sanJuanMap.getByLabel("Участок на карте").selectOption("riosanjuan-castillo-ferry-osm");
    const sanJuanGpx = await exportText(sanJuanMap.getByRole("button", { name: "Скачать точки GPX" }));
    assert.equal((sanJuanGpx.match(/<wpt /g) || []).length, 3);
    assert(!sanJuanGpx.includes("<trk>"));
    assert.equal(await page.locator(".stages li").count(), 7);
    await checkWidth();

    const gulfExpedition = records.get("golfo-dulce-sea-kayak-lodge-expedition-8");
    await open("expeditions?region=south&activity=kayak&duration=long");
    await page.getByRole("link", { name: gulfExpedition.title, exact: true }).click();
    await heading(gulfExpedition);
    const gulfMap = page.getByRole("region", { name: "Карта маршрута" });
    const gulfDays = gulfMap.getByLabel("Участок на карте");
    await gulfMap.locator(".leaflet-marker-pane .route-map-marker").first().waitFor();
    await gulfDays.selectOption("day-6");
    assert.equal(await gulfMap.locator(".route-map-stops li").count(), 3);
    assert.equal(await gulfMap.locator(".leaflet-marker-pane .route-map-marker").count(), 3);
    assert.equal(await gulfMap.locator(".leaflet-overlay-pane path").count(), 0);
    const gulfDayGpx = await exportText(gulfMap.getByRole("button", { name: "Скачать точки GPX" }));
    assert.equal((gulfDayGpx.match(/<wpt /g) || []).length, 3);
    assert(!gulfDayGpx.includes("<trk>") && gulfDayGpx.includes("Могос"));
    await gulfDays.selectOption("");
    assert.equal(await gulfMap.locator(".leaflet-marker-pane .route-map-marker").count(), gulfExpedition.dossier.stops.length);
    await checkWidth();
    const carara = records.get("carara");
    await open("place/carara");
    await heading(carara);
    const cararaMap = page.getByRole("region", { name: "Карта маршрута" });
    const cararaChoice = cararaMap.getByLabel("Вариант на карте");
    const cararaDownload = cararaMap.getByRole("button", { name: "Скачать GPX", exact: true });
    const combinedCarara = await exportText(cararaDownload);
    assert.equal((combinedCarara.match(/<trk>/g) || []).length, 2);
    const lagoon = "carara-laguna-osm-segment";
    await cararaChoice.selectOption(lagoon);
    const cararaLagoon = await exportText(cararaDownload);
    assert.equal((cararaLagoon.match(/<trk>/g) || []).length, 1);
    assert.equal((cararaLagoon.match(/<trkpt /g) || []).length, atlas.lines[lagoon].coords.length);
    assert.equal(await cararaMap.locator(".route-map-stops li").count(), 2);
    await checkWidth();

    const sarchi = records.get("sarchi-square-factory-walk");
    await open("place/" + sarchi.id);
    await heading(sarchi);
    const sarchiMap = page.getByRole("region", { name: "Карта маршрута" });
    const sarchiGpx = await exportText(sarchiMap.getByRole("button", { name: "Скачать GPX", exact: true }));
    assert.equal((sarchiGpx.match(/<wpt /g) || []).length, 3);
    assert.equal((sarchiGpx.match(/<trkpt /g) || []).length, atlas.lines[sarchi.dossier.line].coords.length);
    await page.locator(".detail-photo figcaption a").first().waitFor();
    await checkWidth();

    assert.deepEqual(errors, []);
    console.log(width + " px: catalog, media, route and stage GPX, published sources and access notices passed.");
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ executablePath: process.env.ATLAS_CHROMIUM_EXECUTABLE });
try {
  for (const width of [1440, 393]) await checkViewport(browser, width);
} finally {
  await browser.close();
}
