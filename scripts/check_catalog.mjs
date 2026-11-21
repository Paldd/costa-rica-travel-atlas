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
  if (row.stages?.length > 0) assert.equal(row.stages.length, row.days, row.id);
}

const find = (query, view = "catalog", saves = new Set()) => visibleRecords(records, new URLSearchParams(query), view, saves);
assert(find({ q: "sabanas oka" }).some(row => row.id === "sabana-oka"));
assert(find({ activity: "rooftent", transport: "4x4" }).some(row => row.id === "ganadito-roof"));
assert(find({ transport: "noCar", region: "caribbean", duration: "three" }, "expeditions").some(row => row.id === "tortuguero-no-car"));
assert(find({ duration: "seven", activity: "mtb" }, "expeditions").some(row => row.id === "week-4x4-mtb"));
assert(find({ activity: "packraft", region: "central" }).some(row => row.id === "pejibaye-pack"));
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
console.log(`Validated ${records.length} entries, ${Object.keys(atlas.sources).length} indexed sources and 200 profiles.`);
