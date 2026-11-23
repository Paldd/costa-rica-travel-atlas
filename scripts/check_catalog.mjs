import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  accessModes, activities, audiences, countries, difficulty, kinds, lodging, mapsLink, regions, resolveRecordId, sourceKinds, visibleRecords,
} from "../src/catalog.js";
import { createGpx } from "../src/gpx.js";
import { resolveTripRoutes } from "../src/tripPlans.js";

const atlas = JSON.parse(readFileSync(new URL("../public/atlas.json", import.meta.url)));
const records = atlas.records;
const known = new Set(records.map(row => row.id));
assert.equal(known.size, records.length);
for (const [previous, canonical] of Object.entries(atlas.recordAliases)) {
  assert.match(previous, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert(!known.has(previous) && known.has(canonical), previous);
}
const oldIrazu = "ira-tur-ebike-aquiares";
const irazu = "irazu-la-central-aquiares-emtb";
assert.equal(resolveRecordId(oldIrazu, atlas.recordAliases), irazu);
const savedPlan = { activeId: "trip", trips: [{ id: "trip", sourceId: oldIrazu, days: [{
  note: "Original plan", entries: [{ key: "ride", recordId: oldIrazu, visited: true }],
}] }] };
const [resolvedPlan] = resolveTripRoutes(savedPlan, atlas.recordAliases).trips;
assert.equal(resolvedPlan.sourceId, irazu);
assert.deepEqual(resolvedPlan.days[0].entries, [{ key: "ride", recordId: irazu, visited: true }]);
assert.equal(new Set(records.map(row => row.region)).size, Object.keys(regions).length);
for (const source of Object.values(atlas.sources)) {
  assert.equal(new URL(source.url).protocol, "https:", source.id);
  assert(source.scope && source.title && source.kind in sourceKinds, source.id);
}
assert.equal(new Set(atlas.guides.map(guide => guide.url)).size, atlas.guides.length);
for (const guide of atlas.guides) {
  assert.equal(new URL(guide.url).protocol, "https:", guide.name);
  assert(["es", "en", "es-en"].includes(guide.language) && guide.focus && guide.name);
}
for (const [id, line] of Object.entries(atlas.lines)) {
  assert(line.note && line.source in atlas.sources, id);
  if (line.stages) {
    assert(!line.coords && line.stages.length > 1 && new Set(line.stages).size === line.stages.length, id);
    for (const key of line.stages) {
      const stage = atlas.lines[key];
      assert(stage?.coords && stage.title && stage.points?.length >= 2 && stage.stageSource in atlas.sources, `${id}: ${key}`);
    }
    continue;
  }
  assert(line.coords.length > 1, id);
  assert(line.coords.every(([lat, lon]) => lat >= 5 && lat <= 15.1 && lon >= -88 && lon <= -77), id);
}
for (const row of records) {
  assert.match(row.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert(row.title && row.summary && row.plan && row.conditions && row.native, row.id);
  assert(row.kind in kinds && row.level in difficulty && row.region in regions, row.id);
  if (row.activities.includes("border")) {
    assert(row.countries?.includes("cr") && row.countries.length > 1, row.id);
  }
  assert((row.countries || ["cr"]).every(country => country in countries), row.id);
  assert(Number.isFinite(row.days) && row.days > 0, row.id);
  assert(row.distance === null || Number.isFinite(row.distance) && row.distance > 0, row.id);
  assert.match(row.checked, /^\d{4}-\d{2}-\d{2}$/);
  assert(row.sources.length > 0 && row.sources.every(id => id in atlas.sources), row.id);
  for (const [items, choices] of [[row.activities, activities], [row.audience, audiences], [row.access, accessModes], [row.sleep, lodging]]) {
    assert(items.length > 0 && items.every(item => item in choices), `${row.id}: ${items}`);
  }
  assert((row.stages || []).every((s, i) => s.day === i + 1 && s.title && s.note && s.stops.every(id => known.has(id))), row.id);
  assert((row.stages || []).every(s => (s.sources || []).every(id => id in atlas.sources)), row.id);
  assert(row.dossier?.stops?.length > 0, row.id + ": map points");
  assert(row.dossier.photos?.length || row.dossier.stageCover || row.dossier.galleries?.length, row.id + ": photo or gallery");
  if (row.dossier) {
    const { stops, track, line, sections, contacts, nearby = [] } = row.dossier;
    assert(stops.every(stop => stop.name && stop.role && stop.source in atlas.sources && stop.coords.every(Number.isFinite)), row.id);
    assert(stops.every(stop => !stop.activity || stop.activity in activities), row.id);
    const stageIds = new Set((row.stages || []).flatMap(stage => stage.stops));
    const mediaStops = row.dossier.mediaStops || [];
    assert.equal(new Set(mediaStops).size, mediaStops.length, row.id);
    for (const id of mediaStops) {
      const place = records.find(record => record.id === id);
      const media = place?.dossier;
      assert(id !== row.id && (media?.photos?.length || media?.galleries?.length || media?.videos?.length || media?.videoCollections?.length), id);
      assert(stageIds.has(id) || nearby.includes(id) && stops.some(stop => stop.point === media.stops[0]?.point), row.id);
    }
    if (row.dossier.stageCover) {
      const { record, file, caption } = row.dossier.stageCover;
      assert(mediaStops.includes(record) && caption.startsWith("Остановка · "), row.id);
      assert(records.find(place => place.id === record).dossier.photos.some(photo => photo.file === file), row.id);
    }
    assert(!track || track in atlas.sources, row.id);
    assert(!line || line in atlas.lines && stops.length > 1, row.id);
    for (const stage of atlas.lines[line]?.stages || []) {
      assert(atlas.lines[stage].points.every(point => stops.some(stop => stop.point === point)), `${row.id}: ${stage}`);
    }
    assert(sections.length > 0 && sections.every(section => section.title && section.text && section.sources.length && section.sources.every(id => id in atlas.sources)), row.id);
    assert(contacts.every(contact => contact.name && contact.note && contact.source in atlas.sources), row.id);
    assert(contacts.every(contact => [contact.url, contact.whatsapp].every(link => !link || new URL(link).protocol === "https:")), row.id);
    assert(nearby.every(id => id !== row.id && known.has(id)), row.id);
    assert(new Set([...row.sources, ...sections.flatMap(section => section.sources)]).size >= 2, row.id);
  }
  if (row.stages?.length > 0) assert.equal(row.stages.length, row.days, row.id);
}

const find = (query, view = "catalog", saves = new Set()) => visibleRecords(records, new URLSearchParams(query), view, saves);
const combined = find([["activity", "rooftent"], ["activity", "kayak"]]);
assert(combined.some(row => row.id === "miramar-punta-morales-roof-2"));
assert(combined.length < find({ activity: "rooftent" }).length);
assert(combined.every(row => row.activities.includes("rooftent") && row.activities.includes("kayak")));
const canoes = find({ activity: "canoe" });
assert(canoes.some(row => row.id === "penshurt-aviarios-buttercup-canoe" && row.dossier.photos.length === 2));
assert(canoes.some(row => row.id === "tortuguero-mora-canoe-kayak"));
assert(canoes.every(row => row.activities.includes("canoe")));
const guacimoRoad = atlas.lines["suerre-escuela-pozas-road-osm"];
const guacimoCamp = records.find(row => row.id === "suerre-pozas-guacimo-camp-4x4");
const roadStart = guacimoCamp.dossier.stops.find(stop => stop.point === "suerre-school-road-start");
const roadFinish = guacimoCamp.dossier.stops.find(stop => stop.point === "pozas-guacimo-parking-osm");
assert.equal(guacimoCamp.dossier.line, "suerre-escuela-pozas-road-osm");
assert.deepEqual(guacimoRoad.coords[0], roadStart.coords);
assert.deepEqual(guacimoRoad.coords.at(-1), roadFinish.coords);
const caminar = records.find(row => row.id === "suerre-pozas-guacimo-hike-17");
assert.equal(caminar.dossier.track, "suerre-pozas-hike-field-2026");
assert(!caminar.dossier.line && !caminar.dossier.connectStops);

const dryOutings = find({ activity: "dry-slide" });
assert(dryOutings.some(row => row.id === "dinoland-pura-vida-dry-slide" && row.dossier.videos.length >= 2));
assert(dryOutings.every(row => row.activities.includes("dry-slide")));
const tesoroWeekend = dryOutings.find(row => row.id === "bajos-tesoro-dinoland-roof-2");
const tesoroRoute = atlas.lines[tesoroWeekend.dossier.line];
assert.deepEqual(tesoroRoute.stages, ["tesoro-walk-first-osm", "tesoro-dinoland-drive-osm"]);
for (const id of tesoroRoute.stages) {
  const part = atlas.lines[id];
  const [start, finish] = part.points.map(point => tesoroWeekend.dossier.stops.find(stop => stop.point === point));
  assert.deepEqual(part.coords[0], start.coords, id);
  assert.deepEqual(part.coords.at(-1), finish.coords, id);
}
assert(tesoroWeekend.stages[0].stops.includes("bajos-tesoro-rooftent-camp"));
assert(tesoroWeekend.stages[1].stops.includes("dinoland-pura-vida-dry-slide"));

const weekend = records.find(row => row.id === "miramar-punta-morales-roof-2");
const gpx = createGpx("План <гора> & берег", [{ title: weekend.title, line: atlas.lines[weekend.dossier.line], stops: weekend.dossier.stops }], atlas);
assert(gpx.includes("План &lt;гора&gt; &amp; берег"));
assert(gpx.includes("<trkseg>") && gpx.includes("https://www.openstreetmap.org/copyright"));
assert.equal((gpx.match(/<wpt /g) || []).length, weekend.dossier.stops.length);
const camino = records.find(row => atlas.lines[row.dossier?.line]?.source === "camino-maram-gpx-library");
const waypointOnly = createGpx(camino.title, [{ title: camino.title, line: atlas.lines[camino.dossier.line], stops: camino.dossier.stops }], atlas);
assert(waypointOnly.includes("<wpt ") && !waypointOnly.includes("<trk>"));
assert(find({ q: "sabanas oka" }).some(row => row.id === "sabana-oka"));
assert(find({ activity: "rooftent", transport: "4x4" }).some(row => row.id === "ganadito-roof"));
assert(find({ activity: "rooftent", material: "photo-video" }).some(row => row.id === "las-trillizas-roofcamp"));
assert(find({ material: "missing-photo" }).every(row => !row.dossier.photos?.length && !row.dossier.stageCover));
assert(find({ material: "missing-video" }).every(row => !row.dossier.videos?.length));
const channelOnlyCard = atlas.records.find(row => row.id === "jaco-utv-rey-100");
assert(channelOnlyCard.dossier.videoCollections.includes("axr-jaco-utv-video"));
assert(!channelOnlyCard.dossier.videos.length);
assert(find({ material: "missing-video" }).includes(channelOnlyCard));
const turrialbaCamp = records.find(row => row.id === "las-trillizas-roofcamp");
assert.deepEqual(turrialbaCamp.dossier.stops[0].coords, [9.9751212, -83.7055168]);
assert.equal(turrialbaCamp.dossier.line, "las-trillizas-first-walk-osm");
assert(turrialbaCamp.dossier.connectStops === false && turrialbaCamp.dossier.stops.length === 3);
const trillizasLine = atlas.lines[turrialbaCamp.dossier.line];
assert.equal(trillizasLine.source, "osm-trillizas-farm-path");
assert(!trillizasLine.coords.some(coords => coords.join() === turrialbaCamp.dossier.stops.at(-1).coords.join()));
const monteCamp = records.find(row => row.id === "monte-sky-camping-orosi");
assert.deepEqual(atlas.lines[monteCamp.dossier.line].stages, ["monte-sky-road-osm", "monte-sky-house-walk-osm"]);
const lakeCamp = records.find(row => row.id === "mosqueritos-dota-lake-camp");
const lakeRoad = atlas.lines[lakeCamp.dossier.line];
assert.deepEqual(lakeRoad.coords[0], lakeCamp.dossier.stops[0].coords);
assert(lakeCamp.dossier.stops[1].coords[1] < -83.957);
const lakeTrail = records.find(row => row.id === "mosqueritos-dota-short-trail");
const mappedTrail = atlas.lines[lakeTrail.dossier.line];
assert.deepEqual(mappedTrail.coords[0], lakeTrail.dossier.stops[1].coords);
assert.deepEqual(mappedTrail.coords.at(-1), lakeTrail.dossier.stops[2].coords);
const mosqueritosTrack = records.find(row => row.id === "mosqueritos-dota-forest-loop-6");
assert.equal(mosqueritosTrack.dossier.trackKind, "track");
assert.equal(mosqueritosTrack.distance, 6.03);
assert(find({ transport: "noCar", region: "caribbean", duration: "three" }, "expeditions").some(row => row.id === "tortuguero-no-car"));
assert(find({ duration: "seven", activity: "mtb" }, "expeditions").some(row => row.id === "week-4x4-mtb"));
assert(find({ country: "pa", activity: "border", transport: "noCar" }).some(row => row.id === "sixaola-bocas-family-3"));
assert(find({ country: "ni", activity: "border" }).some(row => row.id === "tablillas-san-carlos-river-4"));
assert(find({ audience: "family-adults" }).some(row => row.id === "arenal-bike-camp-3"));
assert(find({ activity: "packraft", region: "central" }).some(row => row.id === "pejibaye-pack"));
assert(find({ km: "ten", activity: "hiking" }).some(row => row.id === "palo-verde-cerro-alto"));
assert(find({ km: "hundred", activity: "hiking", detail: "map" }, "expeditions").some(row => row.id === "el-camino-102"));
assert(find({ activity: "ebike", detail: "map" }).some(row => row.id === "pinilla-emtb"));
const routesWithLines = find({ detail: "line" });
const routesWithTracks = find({ detail: "track" });
const routesWithMapLinks = find({ detail: "route-map" });
assert.equal(routesWithLines.length, records.filter(row => row.dossier.line).length);
assert.equal(routesWithTracks.length, records.filter(row => row.dossier.trackKind === "track").length);
assert.equal(routesWithMapLinks.length, records.filter(row => row.dossier.trackKind === "map").length);
assert(routesWithLines.some(row => row.id === "talamanca-reef-surf-3"));
assert(routesWithTracks.some(row => row.id === "nicoya-bikepack-6"));
assert(routesWithTracks.some(row => row.id === "oropendola-guachipelin-walk"));
assert(routesWithMapLinks.some(row => row.id === "pejibaye-school-own-packraft"));
assert(!routesWithTracks.some(row => ["chira-glamp", "pejibaye-school-own-packraft"].includes(row.id)));
for (const id of ["nicoya-bikepack-6", "golfo-dulce-kayak-camp-3", "talamanca-reef-surf-3"]) {
  const dossier = records.find(row => row.id === id).dossier;
  assert(dossier.photos.length > 0 && dossier.galleries.length > 0 && dossier.videos.length > 0, id);
  assert(dossier.photos.every(photo => photo.author && photo.original && photo.licenseUrl), id);
}
assert(find({ activity: "ebike", region: "south" }).some(row => row.id === "uvita-ballena-chaman-ebike-loop"));
const jacoRide = find({ country: "cr", activity: "ebike", region: "centralpac", km: "short", detail: "map" })
  .find(row => row.id === "jaco-pastor-diaz-ebike-4");
assert(jacoRide?.dossier.stops.length === 3);
const jacoLine = atlas.lines[jacoRide.dossier.line];
assert.deepEqual(jacoLine.coords[0], jacoLine.coords.at(-1));
const jacoGpx = createGpx(jacoRide.title, [{ title: jacoRide.title, line: jacoLine, stops: jacoRide.dossier.stops }], atlas);
assert.equal((jacoGpx.match(/<trkpt /g) || []).length, jacoLine.coords.length);
assert(find({ activity: "ebike", region: "central", material: "report" })
  .some(row => row.id === "aserri-san-gabriel-dragon-emtb-56" && row.reportSources.includes("aserri-dragon-field-track")));
assert(find({ activity: "ebike", sleep: "roof", duration: "two" }, "expeditions")
  .some(row => row.id === "sardinal-sukka-ebike-weekend-2" && row.stages.length === 2));
assert(find({ country: "ni", region: "rivas-coast", activity: "surf" })
  .some(row => row.id === "playa-maderas-casa-oro-surf"));
const tentCircuit = find({ activity: "glamping", region: "centralpac", duration: "long", detail: "map" }, "expeditions")
  .find(row => row.id === "arenal-monteverde-savegre-family-tents-8");
assert(tentCircuit?.stages.length === 8 && tentCircuit.access.includes("4x4"));
const tentCircuitLine = atlas.lines[tentCircuit.dossier.line];
assert.equal(tentCircuitLine.stages.length, 3);
const tentCircuitGpx = createGpx(tentCircuit.title, [{
  title: tentCircuit.title, line: tentCircuitLine, stops: tentCircuit.dossier.stops,
}], atlas);
assert.equal((tentCircuitGpx.match(/<trkseg>/g) || []).length, 3);
assert(find({ activity: "rooftent", region: "nicoya" }).some(row => row.id === "junquillal-malinches-rooftent"));
assert(find({ activity: "scuba", sleep: "liveaboard", duration: "long" }, "expeditions")
  .some(row => row.id === "cocos-sea-hunter-11-liveaboard"));
assert(find({ country: "pa", region: "chiriqui-coast", activity: "boat" })
  .some(row => row.id === "paso-canoas-boca-chica-family-4"));
const ferry = find({ country: "ni", region: "ometepe", activity: "boat" })
  .find(row => row.id === "ometepe-san-jorge-ferry");
assert(ferry && decodeURIComponent(mapsLink(ferry)).endsWith("Nicaragua"));
assert(atlas.lines[ferry.dossier.line].coords.length > 5);
const bocasRides = find({ country: "pa", region: "bocas", activity: "ebike", detail: "line" });
for (const id of ["bocas-colon-paunch-bluff-ebike", "bocas-colon-drago-ebike"]) {
  const ride = bocasRides.find(row => row.id === id);
  assert(ride?.distance >= 20 && ride.dossier.stops.length >= 3, id);
}
for (const id of ["sixaola-bocas-family-3", "sixaola-bocas-colon-bastimentos-family-5"]) {
  const trip = find({ country: "pa", region: "bocas", activity: "border" }, "expeditions").find(row => row.id === id);
  assert(trip?.stages.every(day => day.stops.length >= 2), id);
  const tripLine = atlas.lines[trip.dossier.line];
  const landLegs = tripLine.stages.filter(leg => !atlas.lines[leg].water);
  const tripGpx = createGpx(trip.title, [{ title: trip.title, line: tripLine, stops: trip.dossier.stops }], atlas);
  assert(tripLine.stages.includes("bocas-lancha-osm"), id);
  assert.equal((tripGpx.match(/<trkseg>/g) || []).length, landLegs.length, id);
  assert.equal((tripGpx.match(/<wpt /g) || []).length, trip.dossier.stops.length, id);
}
const carFerry = records.find(row => row.id === "bocas-almirante-isla-colon-car-ferry");
assert(carFerry.access.includes("4x4") && atlas.lines[carFerry.dossier.line].water);
assert(carFerry.dossier.stops.every(stop => stop.point.endsWith("-car")));
for (const [id, length] of [["tablillas-san-carlos-river-4", "five"], ["tablillas-solentiname-el-castillo-7", "seven"]]) {
  const expedition = find({ country: "ni", region: "rio-san-juan", duration: length, activity: "border" }, "expeditions")
    .find(row => row.id === id);
  assert(expedition?.stages.every(day => day.stops.length > 0), id);
  const route = atlas.lines[expedition.dossier.line];
  const legs = route.stages.map(leg => atlas.lines[leg]);
  assert(legs.some(leg => leg.water) && legs.some(leg => !leg.water), id);
  const gpx = createGpx(expedition.title, [{ title: expedition.title, line: route, stops: expedition.dossier.stops }], atlas);
  assert.equal((gpx.match(/<trkseg>/g) || []).length, legs.filter(leg => !leg.water).length);
  assert.equal((gpx.match(/<wpt /g) || []).length, expedition.dossier.stops.length);
}
const lakeBoat = records.find(row => row.id === "rio-san-juan-san-carlos-solentiname-lancha");
assert(lakeBoat.dossier.stops.length === 3 && !lakeBoat.dossier.line);
const sanJuanPaddle = find({ country: "ni", region: "rio-san-juan", duration: "five", activity: "kayak" }, "expeditions")
  .find(row => row.id === "rio-san-juan-caribbean-guided-kayak-5");
assert(sanJuanPaddle.dossier.accessNotice && sanJuanPaddle.dossier.stops.length >= 4);
assert(!sanJuanPaddle.activities.includes("own-craft"));
assert(find({ activity: "own-craft", detail: "map" }).some(row => row.id === "pacuare-own-craft"));
assert.equal(find({ region: "caribbean" }, "saved", new Set(["sabana-oka"])).length, 0);
assert.equal(find({}, "saved", new Set(["sabana-oka"])).length, 1);
assert.equal(find({ q: "очень-специфичное-отсутствующее-место" }).length, 0);
assert.equal(atlas.social.profiles?.length, 200);
assert.equal(new Set(atlas.social.profiles.map(row => row.url)).size, 200);
assert.equal(atlas.social.profiles.filter(row => row.platform === "Instagram").length, 100);
assert.equal(atlas.social.profiles.filter(row => row.platform === "Facebook").length, 100);
assert.equal(atlas.social.overview.instagramPosts,
  atlas.social.profiles.filter(row => row.platform === "Instagram").reduce((count, row) => count + row.posts, 0));
assert.equal(atlas.social.overview.facebookPosts,
  atlas.social.profiles.filter(row => row.platform === "Facebook").reduce((count, row) => count + row.posts, 0));
for (const platform of ["Instagram", "Facebook"]) {
  const profiles = atlas.social.profiles.filter(row => row.platform === platform);
  const expectedHost = platform === "Instagram" ? /instagram\.com$/ : /facebook\.com$/;
  profiles.forEach((row, index) => {
    assert.equal(row.rank, index + 1, row.name);
    assert(Number.isInteger(row.followers) && row.followers > 1000, row.name);
    assert(index === 0 || profiles[index - 1].followers >= row.followers, row.name);
    assert.match(row.countChecked, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(new URL(row.countSource).hostname, expectedHost);
    if (row.publisher) {
      assert(row.publisher.site in atlas.sources, row.name);
      assert(!row.publisher.archive || row.publisher.archive in atlas.sources, row.name);
      assert.match(row.publisher.checked, /^\d{4}-\d{2}-\d{2}$/);
    }
  });
}
const profilesWithSites = atlas.social.profiles.filter(row => row.publisher);
assert.equal(atlas.social.overview.publisherLinks, profilesWithSites.length);
assert.equal(atlas.social.overview.publisherArchiveLinks, profilesWithSites.filter(row => row.publisher.archive).length);
assert(profilesWithSites.some(row => row.platform === "Instagram" && row.publisher.archive));
assert(profilesWithSites.some(row => row.platform === "Facebook" && row.publisher.archive));
const publisherReview = atlas.social.publisherReview;
assert.match(publisherReview.dayUtc, /^\d{4}-\d{2}-\d{2}$/);
assert(publisherReview.pagesRead >= 0 && publisherReview.pagesReadToDate >= publisherReview.pagesRead);
const readPageByArchive = new Map(Object.entries(publisherReview.guidePages));
for (const profile of atlas.social.profiles) {
  if (profile.publisher?.coverage?.pages) readPageByArchive.set(profile.publisher.archive, profile.publisher.coverage.pages);
}
const publicReadPages = [...readPageByArchive.values()].flat();
assert.equal(new Set(publicReadPages.map(page => page.url)).size, publisherReview.history ? publisherReview.pagesReadToDate : publisherReview.pagesRead);
const publicationKey = (platform, url) => `${platform}:${new URL(url).pathname.split("/").filter(Boolean).at(-1)}`;
const confirmedPostKeys = new Set(atlas.social.profiles.flatMap(row =>
  (row.postLinks || []).map(link => publicationKey(row.platform, atlas.sources[link.source].url))));
const pendingPostKeys = publisherReview.nativeCandidates.map(row => publicationKey(row.platform, row.url));
assert.equal(new Set(pendingPostKeys).size, pendingPostKeys.length);
assert(pendingPostKeys.every(key => !confirmedPostKeys.has(key)));
assert(publisherReview.nativeCandidates.every(row => ["Instagram", "Facebook"].includes(row.platform) &&
  row.title && row.checked <= publisherReview.dayUtc && new URL(row.article).protocol === "https:"));
if (publisherReview.history) {
  assert.equal(publicReadPages.filter(page => page.readThisRun).length, publisherReview.pagesRead);
  assert(publicReadPages.every(page => /^\d{4}-\d{2}-\d{2}$/.test(page.checked)));
}
const coveredPublishers = profilesWithSites.filter(row => row.publisher.coverage);
assert(coveredPublishers.some(row => row.platform === "Facebook"));
for (const row of coveredPublishers) {
  const { read, indexed, pages } = row.publisher.coverage;
  const currentArchive = Number.isInteger(read) && Number.isInteger(indexed) && 0 <= read && read <= indexed;
  const pastArchive = publisherReview.history && read === null && indexed === null && pages?.length;
  assert(currentArchive || pastArchive, row.name);
  assert(row.publisher.archive in atlas.sources, row.name);
}
const facebookLinks = atlas.social.profiles.filter(row => row.platform === "Facebook").flatMap(row => row.postLinks || []);
assert.equal(facebookLinks.length, atlas.social.overview.facebookPosts);
assert.equal(new Set(facebookLinks.map(link => atlas.sources[link.source].url)).size, facebookLinks.length);
const instagramWithOriginals = atlas.social.profiles.filter(row => row.platform === "Instagram" && row.postLinks?.length);
const instagramLinks = instagramWithOriginals.flatMap(row => row.postLinks);
const instagramCodes = instagramLinks.map(link => {
  assert.match(link.checked, /^\d{4}-\d{2}-\d{2}$/);
  const post = new URL(atlas.sources[link.source].url);
  assert.equal(post.hostname, "www.instagram.com");
  return post.pathname.split("/").filter(Boolean).at(-1);
});
assert.equal(instagramLinks.length, atlas.social.overview.instagramOpenedPosts);
assert.equal(new Set(instagramCodes).size, instagramLinks.length);
assert.equal(instagramWithOriginals.length, atlas.social.overview.instagramWithOpenedPosts);
assert.equal(atlas.social.overview.instagramWithMultipleOpenedPosts,
  instagramWithOriginals.filter(row => row.postLinks.length > 1).length);
for (const row of instagramWithOriginals) {
  const dates = row.postLinks.flatMap(link => link.published ? [link.published] : []).sort();
  if (dates.length) assert.deepEqual(row.postPeriod, { first: dates[0], last: dates.at(-1) }, row.name);
}
const checkedFeeds = atlas.social.profiles.flatMap(row => row.liveCheck ? [row.liveCheck] : []);
assert.equal(atlas.social.overview.browserChecks, checkedFeeds.length);
assert.equal(atlas.social.overview.visibleBrowserFeeds, checkedFeeds.filter(receipt => receipt.status === "feed-visible").length);
for (const receipt of checkedFeeds) {
  assert.match(receipt.checked, /^\d{4}-\d{2}-\d{2}$/);
  assert(["feed-visible", "grid-visible", "profile-only", "login-required"].includes(receipt.status));
  assert(receipt.detail.trim());
}
const copiedProfiles = atlas.social.profiles.filter(row => row.copySample);
assert.equal(atlas.social.overview.facebookWithCopies, copiedProfiles.length);
assert.equal(atlas.social.overview.facebookCopiedPosts, copiedProfiles.reduce((sum, row) => sum + row.copySample.count, 0));
for (const row of copiedProfiles) {
  const { source, count, first, last, checked, items } = row.copySample;
  assert.equal(row.platform, "Facebook");
  assert(source in atlas.sources);
  assert(Number.isInteger(count) && count > 0 && first <= last && last <= checked);
  if (items) {
    assert.equal(items.length, count, row.name);
    assert.equal(items[0].published, last, row.name);
    assert.equal(items.at(-1).published, first, row.name);
    assert(items.every(item => item.summary && (!item.record || known.has(item.record))), row.name);
  }
}
assert(atlas.social.overview.instagramUniquePosts <= atlas.social.overview.instagramPosts);
assert(find({ q: "Bajos del Toro", duration: "two", detail: "map" }, "expeditions").some(row => row.id === "bajos-toro-weekend"));
assert(find({ region: "nicoya", activity: "gravel", km: "hundred" }).some(row => row.id === "santa-teresa-nosara-gravel-101"));
assert(find({ region: "south", activity: "camping", transport: "noCar", duration: "three" }, "expeditions").some(row => row.id === "drake-rincon-3-no-car"));
assert(find({ region: "north", activity: "own-craft" }).some(row => row.id === "cote-own-kayak-packraft"));
assert(find({ region: "centralpac", activity: "rooftent", duration: "two" }).some(row => row.id === "bijagual-rooftent-visit"));
assert(find({ region: "mountains", activity: "summit", km: "thirty", duration: "three" }, "expeditions").some(row => row.id === "uran-herradura-camp-3"));
assert(find({ region: "mountains", activity: "summit", km: "fifty", duration: "five" }, "expeditions").some(row => row.id === "pila-kamuk-55-5"));
assert(find({ region: "caribbean", activity: "boat", transport: "noCar", duration: "three" }, "expeditions").some(row => row.id === "yorkin-bribri-canoe-3"));
assert(find({ region: "caribbean", activity: "own-craft" }).some(row => row.id === "cahuita-sunrise-kayak-atec"));
assert(find({ region: "north", activity: "rooftent", duration: "two", detail: "map" }).some(row => row.id === "cano-negro-poponjoche-rooftent"));
assert(find({ region: "central", activity: "ebike", duration: "seven", km: "long" }, "expeditions").some(row => row.id === "turrialba-full-ebike-7"));
assert(find({ region: "south", activity: "rooftent", transport: "4x4", duration: "three" }, "expeditions").some(row => row.id === "osa-two-camps-roof-3"));
const carateBike = find({ region: "south", activity: "gravel", duration: "two", detail: "line" }, "expeditions")
  .find(row => row.id === "puerto-jimenez-carate-gravel-mtb-2");
assert.equal(carateBike.distance, 84.8);
assert.equal(carateBike.dossier.track, "osa-carate-very-cycle-track-2015");
const preciosa = find({ region: "south", activity: "ebike", detail: "line" })
  .find(row => row.id === "puerto-jimenez-playa-preciosa-ebike");
assert.equal(preciosa.distance, 10.8);
assert.match(createGpx(preciosa.title, [{ title: preciosa.title, line: atlas.lines[preciosa.dossier.line],
  stops: preciosa.dossier.stops }], atlas), /<trkpt /);
const cativo = find({ region: "south", activity: "surf", transport: "noCar", detail: "line" }, "expeditions")
  .find(row => row.id === "playa-cativo-golfo-dulce-matapalo-4");
assert.equal(cativo.stages.length, 4);
assert.deepEqual(atlas.lines[cativo.dossier.line].points, ["puerto-jimenez-port", "pan-dulce-osa-shore"]);
const sirenaFlight = find({ region: "south", activity: "scenic-flight", material: "video" })
  .find(row => row.id === "corcovado-sirena-helicopter-hike");
assert(!sirenaFlight.dossier.line && !sirenaFlight.dossier.connectStops);
const gulfExpedition = find({ region: "south", activity: "kayak", duration: "long" }, "expeditions")
  .find(row => row.id === "golfo-dulce-sea-kayak-lodge-expedition-8");
assert.equal(gulfExpedition.stages.length, 8);
assert.deepEqual(gulfExpedition.stages[5].points, ["osa-playa-blanca-coast", "golfo-dulce-mogos-sector", "golfo-dulce-rincon-sector"]);
assert(!gulfExpedition.dossier.line && !gulfExpedition.dossier.connectStops);
const privateMarinas = find({ region: "south", activity: "own-craft", detail: "map" })
  .find(row => row.id === "golfito-private-boat-marinas");
assert.equal(privateMarinas.dossier.stops.length, 3);
assert(!privateMarinas.activities.some(tag => tag === "sup" || tag === "kayak"));
const poceron = records.find(row => row.id === "providencia-poceron-calle-la-piedra");
const poceronLong = find({ region: "mountains", activity: "hiking", km: "thirty", detail: "track" })
  .find(row => row.id === "dota-quebrada-arroyo-poceron-26");
assert(poceron.distance < 0.2 && poceronLong.distance === 26.3);
assert.equal(poceronLong.dossier.accessNotice.title, "Проход по согласованию");
const dotaWaterfallTrip = find({ region: "mountains", activity: "glamping", duration: "two", detail: "line" }, "expeditions")
  .find(row => row.id === "dota-coffee-poceron-glamping-2");
assert(dotaWaterfallTrip.stages[1].stops.includes(poceron.id));
assert.equal(atlas.lines[dotaWaterfallTrip.dossier.line].stages.length, 2);
const elIndio = records.find(row => row.id === "mastatal-salto-el-indio-7");
assert(elIndio.dossier.accessNotice.sources.includes("mastatal-siempre-verde-lodge-operator"));
assert(!elIndio.dossier.line && elIndio.dossier.stops.every(stop => stop.point === "mastatal-siempre-verde-meeting"));
const kura = records.find(row => row.id === "uvita-kura-adults-forest-bay");
assert(kura.access.includes("4x4") && !kura.audience.includes("family-small"));
assert(kura.dossier.videos.includes("ig-kura-sunset-reel-original"));
for (const handle of ["hotelmakanda", "kuracostarica"]) {
  const profile = atlas.social.profiles.find(row => row.url === `https://www.instagram.com/${handle}/`);
  assert(profile.postLinks.length && profile.postLinks.every(post => atlas.sources[post.source].url.includes(`/${handle}/`)));
}
const farm = records.find(row => row.id === "monteverde-finca-madre-tierra");
assert(farm.posts?.some(post => post.url === "https://www.instagram.com/p/DfmxPxDFybR/"));
assert(find({ activity: "utv", material: "gallery", detail: "map" }).some(row => row.id === "herradura-bijagual-buggy-4"));
assert(find({ activity: "scenic-flight", material: "video" }).some(row => row.id === "cobano-autogyro-nicoya"));
assert(find({ activity: "campfire", sleep: "roof" }).some(row => row.id === "la-central-rooftop-camp"));
assert(find({ q: "Avellanas Soul", material: "report" }).some(row => row.reportSources.includes("avellanas-surf-community-recs")));
assert(find({ q: "Ruta del Quetzal", activity: "offroad" }).some(row => row.dossier.connectStops === false));
const rioCuarto = records.find(row => row.id === "laguna-rio-cuarto-paddle");
assert(rioCuarto.dossier.accessNotice.sources.includes("rio-cuarto-repretel-closed-gate"));
assert(!find({ activity: "kayak" }).includes(rioCuarto));
assert(!find({ activity: "sup" }).includes(rioCuarto));
const rioCuartoWeekend = records.find(row => row.id === "rio-cuarto-hule-2");
assert.equal(atlas.lines[rioCuartoWeekend.dossier.line].stages.length, 4);
assert(rioCuartoWeekend.stages.some(stage => stage.stops.includes("rio-cuarto-manantiales-falls-35")));
console.log(`Validated ${records.length} entries, ${Object.keys(atlas.sources).length} indexed sources and 200 profiles.`);
