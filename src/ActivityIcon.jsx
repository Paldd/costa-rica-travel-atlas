import React from "react";
import {
  Activity, Bike, Bird, CarFront, Coffee, Compass, Fish, Flame, Footprints,
  House, Landmark, Mountain, Plane, Route, Sailboat, Ship, Sun,
  TentTree, TreePine, Truck, Waves, Wind, Zap,
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
const Paddleboard = sportIcon(<>
  <path d="M3 18c3 2 15 2 18 0M9 17l2-5-1-4 4 4 3 1m1-5v10l-2 2M3 22h18" />
  <circle cx="11" cy="5" r="1.5" />
</>);
const Surfboard = sportIcon(<>
  <path d="M4 17 16 5c2-2 5-2 5-2s0 3-2 5L7 20 4 17Zm4 0-3 4m9-12 3 3M2 22h20" />
</>);
const RoofTent = sportIcon(<>
  <path d="m5 9 6-6 7 6H5Zm7-5v5M4 11h15l2 4v4H3v-5l1-3Zm-1 4h18" />
  <circle cx="7" cy="19" r="1.8" fill="currentColor" />
  <circle cx="17" cy="19" r="1.8" fill="currentColor" />
</>);
const Gravel = sportIcon(<>
  <circle cx="5" cy="16" r="3" /><circle cx="19" cy="16" r="3" />
  <path d="m5 16 4-7 3 7h7L16 5h3M7 9h5m-8 13h2m3 0h2m4 0h2m3 0h2" />
</>);
const Mtb = sportIcon(<>
  <circle cx="5" cy="17" r="3" /><circle cx="19" cy="17" r="3" />
  <path d="m5 17 4-8 4 8h6l-3-8h3M7 9h5m-4-3 4-4 3 3m-4-2 1 3 1-1" />
</>);

const groups = [
  ["rides", Zap, "ebike"],
  ["rides", Mtb, "mtb"],
  ["rides", Gravel, "gravel"],
  ["rides", Bike, "road-bike", "cycling"],
  ["land", Truck, "offroad", "utv", "atv"],
  ["land", RoofTent, "rooftent"],
  ["land", TentTree, "camping"],
  ["land", Flame, "campfire"],
  ["land", House, "glamping"],
  ["water", Fish, "fishing"],
  ["water", Wind, "windsurf", "kitesurf", "wingfoil"],
  ["water", Surfboard, "surf", "school"],
  ["water", Raft, "rafting"],
  ["water", Packraft, "packraft"],
  ["water", Paddleboard, "sup"],
  ["water", Kayak, "kayak"],
  ["water", Waves, "tubing", "snorkel", "scuba", "swim"],
  ["water", Sailboat, "catamaran"],
  ["water", Ship, "boat", "own-craft"],
  ["land", Plane, "scenic-flight"],
  ["land", Flame, "thermal"],
  ["nature", Mountain, "summit", "volcano", "cave", "canyoning"],
  ["nature", Activity, "trailrun"],
  ["nature", Footprints, "hiking", "multi"],
  ["land", CarFront, "car", "border"],
  ["land", Coffee, "coffee", "cafe"],
  ["land", Landmark, "history"],
  ["nature", Bird, "wildlife"],
  ["nature", TreePine, "forest", "canopy", "horseback"],
  ["water", Sun, "beach", "white-sand", "dark-sand", "relax"],
  ["water", Waves, "waterfall", "lake", "river"],
  ["nature", Route, "views", "savanna"],
];

const iconByActivity = new Map(groups.flatMap(
  ([tone, Icon, ...ids]) => ids.map(id => [id, { tone, Icon }]),
));
const bikeActivities = ["ebike", "mtb", "gravel", "road-bike"];

export function mainActivity(row) {
  const [activity] = row.activities;
  if (activity === "cycling") return bikeActivities.find(id => row.activities.includes(id)) || activity;
  return activity;
}

export default function ActivityIcon({ activity, size = 20 }) {
  const { tone, Icon } = iconByActivity.get(activity) || { tone: "nature", Icon: Compass };
  return <span className={`activity-icon activity-${tone}`} aria-hidden="true">
    <Icon size={size} strokeWidth={1.75} />
  </span>;
}
