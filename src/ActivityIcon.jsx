import React from "react";
import {
  Backpack, Bike, Bird, CarFront, Coffee, Compass, Fish, Footprints,
  Landmark, Mountain, Plane, Route, Sun, Telescope,
  TentTree, TreePine, Waves,
} from "lucide-react";

function sportIcon(drawing) {
  return function SportIcon({ size, strokeWidth }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{drawing}</svg>;
  };
}

const Raft = sportIcon(<>
  <path d="M2 14h20l-2.8 5H4.8L2 14ZM5 14l1.8-4h10.4l1.8 4M15 5l-5 9M17 2l2 2-2 3-2-2M2 22l3-1 3 1 4-1 4 1 3-1 3 1" />
</>);
const Packraft = sportIcon(<>
  <path d="M4 17c-2-3 1-8 8-8s10 5 8 8-14 3-16 0Zm12-4H8m9-9-9 12M19 2l2 2-3 3m-9 6-3 3" />
</>);
const Kayak = sportIcon(<>
  <path d="M3 18c2-3 5-5 9-5s7 2 9 5c-3 2-15 2-18 0Zm4-3 10-8M4 14l3 2m10-10 2 3M2 22h20" />
  <circle cx="11" cy="9" r="1.5" />
</>);
const Canoe = sportIcon(<>
  <path d="M2.5 13c2.5 1.2 5.7 1.8 9.5 1.8s7-.6 9.5-1.8l-2.7 4.6c-3.1 1.5-10.5 1.5-13.6 0L2.5 13ZM9 15l7-9m-1-1 2.5 2m-9 7-2 2.5M3 22h18" />
</>);
const Paddleboard = sportIcon(<>
  <path d="M3 18c3 2 15 2 18 0M9 17l2-5-1-4 4 4 3 1m1-5v10l-2 2M3 22h18" />
  <circle cx="11" cy="5" r="1.5" />
</>);
const Surfboard = sportIcon(<>
  <path d="M4 17 16 5c2-2 5-2 5-2s0 3-2 5L7 20 4 17Zm4 0-3 4m9-12 3 3M2 22h20" />
</>);
const SurfLesson = sportIcon(<>
  <path d="M5 17V9c0-2.8 1.6-5.3 3.5-6.5C10.4 3.7 12 6.2 12 9v8ZM8.5 9v5m7-9h6m-6 4h4m-4 4h5M2 21l4-1 4 1 4-1 4 1 4-1" />
</>);
const HangingBridge = sportIcon(<>
  <path d="M3 5v14M21 5v14M3 7c3 4 6 6 9 6s6-2 9-6M3 17h18M7 11v6m5-4v4m5-6v6" />
</>);
const RoofTent = sportIcon(<>
  <path d="m5 9 6-6 7 6H5Zm7-5v5M4 11h15l2 4v4H3v-5l1-3Zm-1 4h18" />
  <circle cx="7" cy="19" r="1.8" fill="currentColor" />
  <circle cx="17" cy="19" r="1.8" fill="currentColor" />
</>);
const RoadBike = sportIcon(<>
  <circle cx="5" cy="17" r="3" /><circle cx="19" cy="17" r="3" />
  <path d="m5 17 4-7 3 7h7L15.5 6H19c2 0 2 3 0 3h-1M7 10h5" />
</>);

const OwnCraft = sportIcon(<>
  <path d="M2 13c5 2 15 2 20 0l-3 5H5l-3-5ZM12 3v8m-3-3 3 3 3-3M3 21h18" />
</>);

const Volcano = sportIcon(<>
  <path d="m2 21 7-11 3 1 3-1 7 11H2Zm5-6 3 2 3-2 4 1m-6-9c-2-2 2-3 0-5m4 5c2-2-2-3 0-5" />
</>);

const Beach = sportIcon(<>
  <path d="M3 12a6 6 0 0 1 12 0H3Zm6 0v7m-7 1c2-2 4-2 6 0s4 2 6 0 4-2 7 0" />
  <circle cx="19" cy="6" r="2" />
</>);

const WhiteSand = sportIcon(<>
  <path d="M2 18c5 0 7-4 10-4 4 0 7 4 10 4M2 21h20M12 3v7M8.5 6.5h7m3.5 3v3m-1.5-1.5h3" />
</>);

const DarkSand = sportIcon(<>
  <path d="M2 18c5 0 7-4 10-4 4 0 7 4 10 4M2 21h20m-15-3h2m2-1h2m1 2h2" />
  <circle cx="17" cy="7" r="3" />
</>);

const Gravel = sportIcon(<>
  <circle cx="5" cy="16" r="3" /><circle cx="19" cy="16" r="3" />
  <path d="m5 16 4-7 3 7h7L16 5h3M7 9h5m-8 13h2m3 0h2m4 0h2m3 0h2" />
</>);
const Mtb = sportIcon(<>
  <circle cx="5" cy="17" r="3" /><circle cx="19" cy="17" r="3" />
  <path d="m5 17 4-8 4 8h6l-3-8h3M7 9h5m-4-3 4-4 3 3m-4-2 1 3 1-1" />
</>);
const ElectricBike = sportIcon(<>
  <circle cx="5" cy="17" r="3" /><circle cx="19" cy="17" r="3" />
  <path d="m5 17 4-7 3 7h7l-3-9h3M7 10h4m3-8-3 4h4l-2 4" />
</>);

const PassengerBoat = sportIcon(<>
  <path d="M2 13h20l-3 6H5l-3-6Zm4 0V8h11l3 5M9 8V5h6v3m-6 2.5h.1m3.9 0h.1M2 22l3-1 3 1 4-1 4 1 3-1 3 1" />
</>);

const Catamaran = sportIcon(<>
  <path d="M11 3v12m0-10 7 8h-7m-2-6-4 6h4M2 16h8l-2 4H4l-2-4Zm12 0h8l-2 4h-4l-2-4ZM10 17h4M2 23h20" />
</>);

const Glamping = sportIcon(<>
  <path d="M2 20 10 5l8 15H2Zm5 0v-5h6v5m5-13h4m-2-2v4M16 3h2m-1-1v2" />
</>);

const Tubing = sportIcon(<>
  <circle cx="14" cy="6" r="2" />
  <path d="m6 13 4-4 4 2 3-1m-9 3 8 1 3-2m2 2c1 3-3 5-9 5s-10-2-9-5l2-2m1 3c2 1 4 1.5 6 1.5M2 22l4-1 4 1 4-1 4 1 4-1" />
</>);

const BorderCrossing = sportIcon(<>
  <path d="M3 22V7h3v15M18 22V7h3v15M3 7l1.5-3L6 7m12 0 1.5-3L21 7M6 14h12m-8-3-2 3 2 3m4-6 2 3-2 3" />
</>);

const Offroad = sportIcon(<>
  <circle cx="6" cy="16.5" r="2.5" /><circle cx="18" cy="16.5" r="2.5" />
  <path d="M3.5 15H2V9h3l2-4h9l4 5h2v5h-1.5M8.5 16.5h7M5 10h15M12 5v5M2 22l4-2 4 2 5-2 4 2 3-1" />
</>);

const Zipline = sportIcon(<>
  <path d="m2 4 20 7m-11-4 1 5m-5 0 5 2 3-1m-3 1-2 3 4 1 3 3m-7-4-3 3-3 1" />
  <circle cx="11" cy="10.5" r="1.5" />
</>);

const HotSpring = sportIcon(<>
  <path d="M4 14c-4 5 1 8 8 8s12-3 8-8M5 17c3 2 11 2 14 0M8 13c2-3-2-4 0-7m4 7c3-5-3-5 0-11m4 11c2-3-2-4 0-7" />
</>);

const Buggy = sportIcon(<>
  <circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" />
  <path d="M2 16v-4h4L9 6h7l4 6h2v4M8 18h8M6 12h14M13 6v6" />
</>);
const Quad = sportIcon(<>
  <circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" />
  <path d="M3 15v-2h6l3 3h4l2-3h4v2m-10 1 2-7h5m-3 0V6M7 11h4M8 18h8" />
</>);

const Scuba = sportIcon(<>
  <path d="M3 8h18v5c0 2-2 4-4 4h-2l-3-3-3 3H7c-2 0-4-2-4-4V8ZM2 10h1m18 0h1M7 11h2m6 0h2m-5 7c-2 0-3 1-3 2s1 2 3 2 3-1 3-2-1-2-3-2Z" />
</>);

const Canyoning = sportIcon(<>
  <path d="m2 6 4-3 6 3-4 5-2 6H2m10-11v4m0 0-2 4 2 3-2 4m2-4 4 2 3-3m-7-6 5 3h3" />
  <circle cx="15" cy="7" r="1.5" />
</>);

const DrySlide = sportIcon(<>
  <path d="M2 21h20M5 21V4h5v3c0 6 4 10 10 10h2v4M3 4h8M6 9h3m-3 4h4m-4 4h6" />
</>);

const Waterfall = sportIcon(<>
  <path d="M2 6h12l4 4h4M6 7v7m4-7v10m4-8v4m4-2v5M2 21l3-2 3 2 4-2 4 2 3-2 3 2" />
</>);

const TrailRun = sportIcon(<>
  <circle cx="15" cy="4" r="1.8" />
  <path d="m6 10 4-3 4 1 2 4h4m-7-4-3 6 5 3-1 4m-4-7-3 5H3M2 14h3m13 5h4" />
</>);

const Windsurf = sportIcon(<>
  <path d="M3 18h18l-3 2H6l-3-2Zm8 0V3l7 12h-7m0-11-5 11h5M3 23l3-1 3 1 3-1 3 1 3-1 3 1" />
</>);
const Kite = sportIcon(<>
  <path d="M4 8C8 2 14 1 20 4l-6 5c-3-2-6-2-10-1Zm3 0 6 7m4-9-4 9m0 0-2 4m-6 1h15l-3 2H8l-3-2Z" />
</>);
const Wingfoil = sportIcon(<>
  <path d="M3 12C5 7 8 5 12 5s7 2 9 7l-5-2-4 3-4-3-5 2Zm9-7v8m0 0 2 3m-8 2h14l-3 2H8l-2-2Zm8 2v3m-3 0h6" />
</>);
const Horseback = sportIcon(<>
  <path d="m5 20 2-7 4-5 2-5 2 3 3 1 3 5-2 2-4-2-2 3 3 5m-7-9-4-1-2 4m1 7h15" />
  <circle cx="16" cy="9" r=".55" fill="currentColor" />
</>);
const Cave = sportIcon(<>
  <path d="M2 20h20L17 6l-5-3-5 5-5 12Zm6 0v-4l4-5 4 5v4m-4-9v3" />
</>);

const Campfire = sportIcon(<>
  <path d="M12 2c2 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-4 3-6 0 2 1 3 2 4 1-3 2-6 1-8Z" />
  <path d="m6 20 12 2m0-2-12 2" />
</>);

const Snorkel = sportIcon(<>
  <path d="M3 10h13v4a3 3 0 0 1-3 3c-2 0-2-2-3.5-2S8 17 6 17a3 3 0 0 1-3-3v-4Z" />
  <path d="M7 12h1m5 0h1m2 4h2a3 3 0 0 0 3-3V5m-2 0h3" />
</>);

const Swimming = sportIcon(<>
  <circle cx="16.5" cy="9" r="2" />
  <path d="m4 14 6-5-2-2-3 1m5 1 4 5m-12 3c2 0 3-1 5-1s3 1 5 1 3-1 5-1 3 1 5 1M2 21c2 0 3-1 5-1s3 1 5 1 3-1 5-1 3 1 5 1" />
</>);

const groups = [
  ["rides", ElectricBike, "ebike"],
  ["rides", Mtb, "mtb"],
  ["rides", Gravel, "gravel"],
  ["rides", RoadBike, "road-bike"],
  ["rides", Bike, "cycling"],
  ["land", Offroad, "offroad"],
  ["land", Buggy, "utv"],
  ["land", Quad, "atv"],
  ["land", RoofTent, "rooftent"],
  ["land", TentTree, "camping"],
  ["land", Campfire, "campfire"],
  ["land", Glamping, "glamping"],
  ["water", Fish, "fishing"],
  ["water", Windsurf, "windsurf"],
  ["water", Kite, "kitesurf"],
  ["water", Wingfoil, "wingfoil"],
  ["water", Surfboard, "surf"],
  ["water", SurfLesson, "school"],
  ["water", Raft, "rafting"],
  ["water", Packraft, "packraft"],
  ["water", Paddleboard, "sup"],
  ["water", Kayak, "kayak"],
  ["water", Canoe, "canoe"],
  ["water", Scuba, "scuba"],
  ["water", Tubing, "tubing"],
  ["water", Snorkel, "snorkel"],
  ["water", Swimming, "swim"],
  ["land", DrySlide, "dry-slide"],
  ["water", Catamaran, "catamaran"],
  ["water", PassengerBoat, "boat"],
  ["water", OwnCraft, "own-craft"],
  ["land", Plane, "scenic-flight"],
  ["water", HotSpring, "thermal"],
  ["nature", Canyoning, "canyoning"],
  ["nature", Mountain, "summit"],
  ["nature", Volcano, "volcano"],
  ["nature", Cave, "cave"],
  ["nature", TrailRun, "trailrun"],
  ["nature", HangingBridge, "hanging-bridges"],
  ["nature", Footprints, "hiking"],
  ["nature", Backpack, "multi"],
  ["land", CarFront, "car"],
  ["land", BorderCrossing, "border"],
  ["land", Coffee, "coffee", "cafe"],
  ["land", Landmark, "history"],
  ["nature", Bird, "wildlife"],
  ["nature", Zipline, "canopy"],
  ["nature", TreePine, "forest"],
  ["nature", Horseback, "horseback"],
  ["water", Beach, "beach"],
  ["water", WhiteSand, "white-sand"],
  ["water", DarkSand, "dark-sand"],
  ["water", Sun, "relax"],
  ["water", Waterfall, "waterfall"],
  ["water", Waves, "lake", "river"],
  ["nature", Telescope, "views"],
  ["nature", Route, "savanna"],
];

const iconByActivity = new Map(groups.flatMap(
  ([tone, Icon, ...ids]) => ids.map(id => [id, { tone, Icon }]),
));
const bikeActivities = ["ebike", "mtb", "gravel", "road-bike"];

export function mainActivity(row) {
  const [activity] = row.activities;
  if (activity === "cycling") return bikeActivities.find(id => row.activities.includes(id)) || activity;
  if (activity === "offroad") return row.activities.find(id => id === "utv" || id === "atv") || activity;
  return activity;
}

export default function ActivityIcon({ activity, size = 20 }) {
  const { tone, Icon } = iconByActivity.get(activity) || { tone: "nature", Icon: Compass };
  return <span className={`activity-icon activity-${tone}`} aria-hidden="true">
    <Icon size={size} strokeWidth={1.75} />
  </span>;
}
