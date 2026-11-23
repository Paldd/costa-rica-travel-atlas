export const countries = { cr: "Коста-Рика", pa: "Панама", ni: "Никарагуа" };

export const regions = {
  central: "Центральная долина",
  north: "Север и Ареналь",
  guanacaste: "Северный Тихий океан",
  nicoya: "Полуостров Никоя",
  centralpac: "Центральный Тихий океан",
  mountains: "Южные горы",
  south: "Южный Тихий океан",
  caribbean: "Карибское побережье",
  ometepe: "Ометепе и озеро Кокиболька",
  "rivas-coast": "Ривас и побережье Сан-Хуан-дель-Сур",
  "chiriqui-coast": "Залив Чирики",
  "chiriqui-highlands": "Горы Чирики",
};

export const activities = {
  hiking: "Пешие тропы", summit: "Восхождения", trailrun: "Трейлраннинг",
  mtb: "MTB", cycling: "Велопрогулки", "road-bike": "Шоссейный велосипед",
  gravel: "Гравийный велосипед", ebike: "Электровелосипед", camping: "Палаточный кемпинг",
  rooftent: "Палатка на крыше", campfire: "Кемпинг с костровой зоной",
  glamping: "Глэмпинг", offroad: "Оффроуд на 4×4",
  utv: "Багги и UTV", atv: "Квадроциклы ATV", "scenic-flight": "Обзорные полёты",
  car: "Автомобильные поездки", border: "Через границу", canopy: "Канопи", canyoning: "Каньонинг",
  horseback: "Конные прогулки", surf: "Сёрфинг",
  school: "Школы сёрфинга", windsurf: "Виндсёрфинг", kitesurf: "Кайтсёрфинг", wingfoil: "Вингфойл",
  rafting: "Рафтинг", packraft: "Пакрафт", sup: "SUP",
  kayak: "Каяк", boat: "Лодки", "own-craft": "Со своей лодкой или SUP", catamaran: "Катамаран",
  fishing: "Рыбалка", snorkel: "Снорклинг", scuba: "Дайвинг",
  swim: "Купание и бассейны", thermal: "Термальные воды", tubing: "Тюбинг",
  beach: "Пляжи", "white-sand": "Светлый песок", "dark-sand": "Тёмный песок",
  savanna: "Открытые склоны и сухолесье", volcano: "Вулканы", forest: "Леса",
  lake: "Озёра", river: "Реки", waterfall: "Водопады", views: "Смотровые точки",
  coffee: "Кофе и фермы", cafe: "Кафе", relax: "Спокойный отдых", wildlife: "Дикая природа",
  cave: "Пещеры", history: "Исторические места", multi: "Многодневные походы",
};

export const audiences = {
  "family-adults": "Семья без детей",
  "family-small": "С малышами",
  "family-mid": "С детьми 6–11 лет",
  "family-teen": "С подростками",
  friends: "С друзьями",
  mens: "Мужская компания",
  solo: "Один",
};

export const accessModes = {
  public: "Автобус",
  transfer: "Трансфер",
  car: "Обычная машина",
  high: "Высокий клиренс",
  "4x4": "Пикап или 4×4",
  boat: "Лодка",
  confirm: "Подъезд уточнить",
};

export const difficulty = {
  easy: "Лёгкая", moderate: "Умеренная", hard: "Сложная", expedition: "Экспедиционная",
};

export const lodging = {
  day: "Без ночёвки", tent: "Наземная палатка", roof: "Палатка на крыше",
  glamping: "Глэмпинг", lodge: "Лодж, домик или приют", liveaboard: "Каюта на судне",
  confirm: "Ночёвку уточнить",
};

export const kinds = {
  trail: "Маршрут", place: "Место", trip: "Экспедиция", event: "Спортивное событие",
};

export const durations = {
  half: "Полдня", one: "1 день", two: "2 дня", three: "3 дня",
  five: "4–5 дней", seven: "6–7 дней", long: "8+ дней",
};

const distanceLimits = { short: [0, 10], ten: [10, 20], thirty: [20, 40], fifty: [40, 70], hundred: [70, 110], long: [110, Infinity] };
const distances = { short: "До 10 км", ten: "10–19 км", thirty: "20–39 км", fifty: "40–69 км", hundred: "70–109 км", long: "110+ км" };

export const sourceKinds = {
  official: "Официальный источник", operator: "Оператор или организатор",
  directory: "Туристический справочник", experience: "Опыт путешественника",
  event: "Организатор события", map: "Карта", video: "Видео",
  guide: "Путеводитель", track: "Авторский трек", gallery: "Фотогалерея",
};

export const filters = [
  { key: "country", label: "Страна", options: countries },
  { key: "region", label: "Регион", options: regions },
  { key: "activity", label: "Активности", options: activities },
  { key: "audience", label: "С кем", options: audiences },
  { key: "transport", label: "Транспорт", options: { noCar: "Без машины", ...accessModes } },
  { key: "duration", label: "Длительность", options: durations },
  { key: "level", label: "Сложность", options: difficulty },
];

export const secondaryFilters = [
  { key: "km", label: "Расстояние", options: distances },
  { key: "sleep", label: "Ночёвка", options: lodging },
  { key: "kind", label: "Вид записи", options: kinds },
  { key: "detail", label: "Карта и треки", options: {
    map: "С точками на карте", line: "С линией маршрута",
    track: "С внешним GPS-треком", "route-map": "С внешней схемой",
  } },
  { key: "material", label: "Материалы", options: { photo: "Фото в карточке", gallery: "Фотогалереи", video: "Видео", report: "Отзывы и отчёты" } },
];

export function durationBucket(days) {
  if (days < 1) return "half";
  if (days <= 3) return ["", "one", "two", "three"][Math.floor(days)];
  if (days <= 5) return "five";
  if (days <= 7) return "seven";
  return "long";
}

export function durationLabel(days) {
  if (days < 1) return durations.half;
  if (days <= 3) return durations[durationBucket(days)];
  return `${days} дней`;
}

export function fold(text = "") {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[×]/g, "x");
}

export function searchText(record) {
  return fold([
    record.title, record.native, record.summary, regions[record.region],
    ...(record.countries || []).map(country => countries[country]),
    ...record.activities.map(activity => activities[activity]),
    ...record.sleep.map(value => lodging[value]),
    ...(record.dossier?.stops || []).map(stop => stop.name),
  ].join(" "));
}

export function chosenActivities(query) {
  return [...new Set(query.getAll("activity").filter(id => Object.hasOwn(activities, id)))];
}

function hasMaterial(record, material) {
  const dossier = record.dossier;
  switch (material) {
    case "photo": return Boolean(dossier?.photos?.length || dossier?.stageCover);
    case "gallery": return Boolean(dossier?.galleries?.length);
    case "video": return Boolean(dossier?.videos?.length);
    case "report": return Boolean(record.reportSources?.length || record.posts?.length);
    default: return true;
  }
}

export function visibleRecords(records, filters, scope, saves) {
  const tokens = fold(filters.get("q") || "").trim().split(/\s+/).filter(Boolean);
  const region = filters.get("region");
  const country = filters.get("country");
  const activity = chosenActivities(filters);
  const audience = filters.get("audience");
  const transport = filters.get("transport");
  const duration = filters.get("duration");
  const level = filters.get("level");
  const sleep = filters.get("sleep");
  const kind = filters.get("kind");
  const detail = filters.get("detail");
  const material = filters.get("material");
  const km = distanceLimits[filters.get("km")];
  return records.filter(record => {
    if (scope === "expeditions" && record.kind !== "trip") return false;
    if (scope === "saved" && !saves.has(record.id)) return false;
    if (country && !(record.countries || ["cr"]).includes(country)) return false;
    if (region && record.region !== region && !record.regions?.includes(region)) return false;
    if (!activity.every(item => record.activities.includes(item))) return false;
    if (audience && !record.audience.includes(audience)) return false;
    if (transport === "noCar" && !record.access.some(item => ["public", "transfer"].includes(item))) return false;
    if (transport && transport !== "noCar" && !record.access.includes(transport)) return false;
    if (duration && durationBucket(record.days) !== duration) return false;
    if (level && record.level !== level) return false;
    if (sleep && !record.sleep.includes(sleep)) return false;
    if (kind && record.kind !== kind) return false;
    if (detail === "map" && !record.dossier?.stops.length) return false;
    if (detail === "line" && !record.dossier?.line) return false;
    if (detail === "track" && record.dossier?.trackKind !== "track") return false;
    if (detail === "route-map" && record.dossier?.trackKind !== "map") return false;
    if (!hasMaterial(record, material)) return false;
    if (km && (record.distance === null || record.distance < km[0] || record.distance >= km[1])) return false;
    if (!tokens.length) return true;
    const searchable = searchText(record);
    return tokens.every(token => searchable.includes(token));
  });
}

const mapCountryNames = { cr: "Costa Rica", pa: "Panamá", ni: "Nicaragua" };

export const mapsLink = record => {
  const country = mapCountryNames[record.countries?.[0] || "cr"];
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(record.native + " " + country)}`;
};

export const resolveRecordId = (id, aliases = {}) => Object.hasOwn(aliases, id) ? aliases[id] : id;
