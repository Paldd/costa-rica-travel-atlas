import React from "react";
import {
  Activity, Bike, Bird, CarFront, Coffee, Compass, Fish, Flame, Footprints,
  House, Landmark, Mountain, Plane, Route, Sailboat, Ship, Sun,
  TentTree, TreePine, Truck, Waves, Wind, Zap,
} from "lucide-react";

const groups = [
  ["rides", Zap, "ebike"],
  ["rides", Bike, "mtb", "gravel", "road-bike", "cycling"],
  ["land", Truck, "offroad", "utv", "atv"],
  ["land", TentTree, "rooftent", "camping", "campfire"],
  ["land", House, "glamping"],
  ["water", Fish, "fishing"],
  ["water", Wind, "windsurf", "kitesurf", "wingfoil"],
  ["water", Waves, "surf", "school", "rafting", "packraft", "sup", "kayak", "tubing", "snorkel", "scuba", "swim"],
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
