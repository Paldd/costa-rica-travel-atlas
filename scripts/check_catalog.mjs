import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  accessModes, activities, audiences, difficulty, kinds, lodging, regions, visibleRecords,
} from "../src/catalog.js";

const atlas = JSON.parse(readFileSync(new URL("../public/atlas.json", import.meta.url)));
const records = atlas.records;
const known = new Set(records.map(row => row.id));
assert.equal(known.size, records.length);
assert.equal(new Set(records.map(row => row.region)).size, Object.keys(regions).length);
for (const source of Object.values(atlas.sources)) {
  assert.equal(new URL(source.url).protocol, "https:", source.id);
  assert(source.scope && source.title);
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
  assert(line.coords.every(([lat, lon]) => lat >= 5 && lat <= 11.3 && lon >= -88 && lon <= -82.3), id);
}
for (const row of records) {
  assert.match(row.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert(row.title && row.summary && row.plan && row.conditions && row.native, row.id);
  assert(row.kind in kinds && row.level in difficulty && row.region in regions, row.id);
  assert(Number.isFinite(row.days) && row.days > 0, row.id);
  assert(row.distance === null || Number.isFinite(row.distance) && row.distance > 0, row.id);
  assert.match(row.checked, /^\d{4}-\d{2}-\d{2}$/);
  assert(row.sources.length > 0 && row.sources.every(id => id in atlas.sources), row.id);
  for (const [items, choices] of [[row.activities, activities], [row.audience, audiences], [row.access, accessModes], [row.sleep, lodging]]) {
    assert(items.length > 0 && items.every(item => item in choices), `${row.id}: ${items}`);
  }
  assert((row.stages || []).every((s, i) => s.day === i + 1 && s.title && s.note && s.stops.every(id => known.has(id))), row.id);
  assert((row.stages || []).every(s => (s.sources || []).every(id => id in atlas.sources)), row.id);
  if (row.dossier) {
    const { stops, track, line, sections, contacts, nearby = [] } = row.dossier;
    assert(stops.every(stop => stop.name && stop.role && stop.source in atlas.sources && stop.coords.every(Number.isFinite)), row.id);
    assert(!track || track in atlas.sources, row.id);
    assert(!line || line in atlas.lines && stops.length > 1, row.id);
    for (const stage of atlas.lines[line]?.stages || []) {
      assert(atlas.lines[stage].points.every(point => stops.some(stop => stop.point === point)), `${row.id}: ${stage}`);
    }
    assert(sections.length > 0 && sections.every(section => section.title && section.text && section.sources.length && section.sources.every(id => id in atlas.sources)), row.id);
    assert(contacts.every(contact => contact.name && contact.note && contact.source in atlas.sources), row.id);
    assert(contacts.every(contact => !contact.url || new URL(contact.url).protocol === "https:"), row.id);
    assert(nearby.every(id => id !== row.id && known.has(id)), row.id);
    assert(new Set([...row.sources, ...sections.flatMap(section => section.sources)]).size >= 2, row.id);
  }
  if (row.stages?.length > 0) assert.equal(row.stages.length, row.days, row.id);
}

const find = (query, view = "catalog", saves = new Set()) => visibleRecords(records, new URLSearchParams(query), view, saves);
assert(find({ q: "sabanas oka" }).some(row => row.id === "sabana-oka"));
assert(find({ activity: "rooftent", transport: "4x4" }).some(row => row.id === "ganadito-roof"));
assert(find({ transport: "noCar", region: "caribbean", duration: "three" }, "expeditions").some(row => row.id === "tortuguero-no-car"));
assert(find({ duration: "seven", activity: "mtb" }, "expeditions").some(row => row.id === "week-4x4-mtb"));
assert(find({ activity: "packraft", region: "central" }).some(row => row.id === "pejibaye-pack"));
assert(find({ km: "ten", activity: "hiking" }).some(row => row.id === "palo-verde-cerro-alto"));
assert(find({ km: "hundred", activity: "hiking", detail: "map" }, "expeditions").some(row => row.id === "el-camino-102"));
assert(find({ activity: "ebike", detail: "map" }).some(row => row.id === "pinilla-emtb"));
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
const facebookLinks = atlas.social.profiles.flatMap(row => row.postLinks || []);
assert.equal(facebookLinks.length, atlas.social.overview.facebookPosts);
assert.equal(new Set(facebookLinks.map(link => atlas.sources[link.source].url)).size, facebookLinks.length);
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
const farm = records.find(row => row.id === "monteverde-finca-madre-tierra");
assert(farm.posts?.some(post => post.url === "https://www.instagram.com/p/DfmxPxDFybR/"));
console.log(`Validated ${records.length} entries, ${Object.keys(atlas.sources).length} indexed sources and 200 profiles.`);
