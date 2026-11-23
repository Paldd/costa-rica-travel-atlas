import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Clock3, Compass, List,
  Map as MapIcon, MapPin, Mountain, Plus, Search, Users, CarFront, ChevronDown, Camera, CirclePlay, X,
} from "lucide-react";
import {
  accessModes, activities, audiences, chosenActivities, countries, difficulty, durationLabel, filters, fold, kinds,
  lodging, mapsLink, regions, resolveRecordId, secondaryFilters, sourceKinds, visibleRecords,
} from "./catalog.js";
import { addRouteToTrip, editTrip, initialTripPlans, newTrip, resolveTripRoutes, saveTripPlans, selectNewTrip } from "./tripPlans.js";
import ActivityIcon, { mainActivity } from "./ActivityIcon.jsx";
import AccessNotice from "./AccessNotice.jsx";
import RoutePreview from "./RoutePreview.jsx";
import "./styles.css";

const AtlasMap = lazy(() => import("./AtlasMap.jsx"));
const RouteMap = lazy(() => import("./RouteMap.jsx"));
const TripPlanner = lazy(() => import("./TripPlanner.jsx"));
const asset = name => import.meta.env.BASE_URL + name;
const nav = { catalog: "Каталог", expeditions: "Экспедиции", trips: "Мои поездки", saved: "Сохранённое", sources: "Источники" };
const heroImage = { file: "arenal.jpg", alt: "Иллюстрация вулкана Ареналь над тропическим лесом" };
const pictures = {
  "sabana-oka": { file: "sabana.jpg", alt: "Иллюстрация открытого горного ландшафта Таламанки", caption: "Иллюстрация ландшафта" },
  chirripo: { file: "chirripo.jpg", alt: "Иллюстрация высокогорного парамо Чиррипо", caption: "Иллюстрация ландшафта" },
  "marino-ballena": { file: "uvita.jpg", alt: "Иллюстрация берега Марино-Бальена в районе Увиты", caption: "Иллюстрация ландшафта" },
  "las-trillizas-roofcamp": { file: "trillizas-roof-illustration.jpg", alt: "Иллюстрация машины с палаткой на крыше в горной местности", caption: "Иллюстрация снаряжения · ImageGen" },
};
const prominent = ["sabana-oka", "chirripo", "marino-ballena"];
const frontierQuery = new URLSearchParams({ activity: "border" });
const placeInPlanner = id => urlFor("place", new URLSearchParams({ from: "trips" }), id);
const photoFor = row => row.dossier?.photos?.[0] ?? row.dossier?.stageCover ?? pictures[row.id];

function readRoute() {
  const [name = "catalog", query = ""] = window.location.hash.slice(1).split("?", 2);
  const [page, id] = name.split("/");
  return {
    page: page in nav || page === "place" ? page : "catalog",
    id,
    filters: new URLSearchParams(query),
  };
}

function urlFor(page, query = new URLSearchParams(), id = "") {
  const suffix = query.toString();
  return `#${page}${id ? "/" + id : ""}${suffix ? "?" + suffix : ""}`;
}

function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  function updateFilters(query) {
    history.replaceState(null, "", urlFor(route.page, query));
    setRoute(readRoute());
  }
  return [route, updateFilters];
}

function initialSaves() {
  try {
    const saved = JSON.parse(window.localStorage.getItem("cr-atlas-saved") || "[]");
    return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function External({ href, children, className }) {
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={15} aria-hidden="true" /></a>;
}

function Header({ page, saved }) {
  return <header className={`site-header ${page === "place" ? "dark-header" : ""}`}>
    <div className="wrap header-inner">
      <a className="brand" href="#catalog" aria-label="Атлас Коста-Рики, каталог">
        <Mountain aria-hidden="true" strokeWidth="1.25" />
        <span>Атлас Коста-Рики</span>
      </a>
      <nav aria-label="Разделы атласа">
        {Object.entries(nav).map(([key, label]) => <a key={key} href={urlFor(key)}
          aria-current={page === key || (key === "catalog" && page === "place") ? "page" : undefined}
          className={key === "saved" ? "saved-nav" : ""}>
          {key === "saved" && <Bookmark size={18} aria-hidden="true" />}
          {label}{key === "saved" && saved > 0 && <span className="nav-count">{saved}</span>}
        </a>)}
      </nav>
    </div>
  </header>;
}

function Hero() {
  function focusSearch() {
    const input = document.querySelector("#route-search");
    input?.scrollIntoView({ block: "center", behavior: "auto" });
    input?.focus({ preventScroll: true });
  }
  return <section className="hero">
    <div className="hero-copy">
      <h1>Куда поехать <br /><span>в Коста-Рике?</span></h1>
      <p>Походы, кемпинги и поездки от вулканов до океана.</p>
      <div className="hero-actions">
        <button type="button" className="button primary" onClick={focusSearch}>Найти маршрут</button>
        <a href="#expeditions" className="text-link">К экспедициям</a>
        <a href={urlFor("catalog", frontierQuery)} className="text-link">За границу</a>
      </div>
    </div>
    <figure className="hero-media">
      <img className="hero-photo" src={asset(`photos/${heroImage.file}`)} alt={heroImage.alt} fetchPriority="high" />
      <figcaption>Вулкан Ареналь · иллюстрация</figcaption>
    </figure>
  </section>;
}

function SelectFilter({ filter, query, change }) {
  return <label className="select-filter">
    <span className="visually-hidden">{filter.label}</span>
    <select aria-label={filter.label} value={query.get(filter.key) || ""} onChange={event => change(filter.key, event.target.value)}>
      <option value="">{filter.label}</option>
      {Object.entries(filter.options).map(([id, value]) => <option key={id} value={id}>{value}</option>)}
    </select>
    <ChevronDown size={16} aria-hidden="true" />
  </label>;
}

function SearchFilters({ query, setQuery, active }) {
  const [activityOpen, setActivityOpen] = useState(false);
  const activityButton = useRef(null);
  const search = query.get("q") || "";
  const picked = chosenActivities(query);
  function change(key, value) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    setQuery(next);
  }
  function toggleActivity(id) {
    const next = new URLSearchParams(query);
    const selected = picked.includes(id) ? picked.filter(item => item !== id) : [...picked, id];
    next.delete("activity");
    for (const value of selected) next.append("activity", value);
    setQuery(next);
  }
  function closeActivities() {
    setActivityOpen(false);
    activityButton.current?.focus();
  }
  return <section className="search-area" aria-label="Фильтры каталога">
    <label className="search-box" htmlFor="route-search">
      <Search size={23} strokeWidth={1.6} aria-hidden="true" />
      <span className="visually-hidden">Поиск маршрута, места или активности</span>
      <input id="route-search" type="search" placeholder="Поиск маршрута, места или активности"
        value={search} onChange={event => change("q", event.target.value)} />
    </label>
    <div className="filter-row">
      {filters.map(filter => filter.key === "activity"
        ? <button key={filter.key} ref={activityButton} type="button" className="select-filter activity-filter"
            aria-expanded={activityOpen} aria-controls="activity-options" onClick={() => setActivityOpen(open => !open)}>
            <span>{filter.label}{picked.length > 0 && ` (${picked.length})`}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        : <SelectFilter key={filter.key} filter={filter} query={query} change={change} />)}
    </div>
    <div id="activity-options" className="activity-options" hidden={!activityOpen}
      onKeyDown={event => { if (event.key === "Escape") closeActivities(); }}>
      {activityOpen && <><div className="activity-options-header">
        <p id="activity-instructions">В подборку войдут места и маршруты со всеми выбранными активностями.</p>
        <button type="button" className="quiet-button" onClick={closeActivities}>Готово</button>
      </div>
      <div className="activity-choices" role="group" aria-label="Выбрать активности" aria-describedby="activity-instructions">
        {Object.entries(activities).map(([id, label]) => <label key={id}>
          <input type="checkbox" checked={picked.includes(id)} onChange={() => toggleActivity(id)} />
          <span>{label}</span>
        </label>)}
      </div></>}
    </div>
    {picked.length > 0 && <ul className="activity-selection" aria-label="Выбранные активности">
      {picked.map(id => <li key={id}><button type="button" aria-label={`Убрать активность ${activities[id]}`} onClick={() => toggleActivity(id)}>
        {activities[id]}<X size={14} aria-hidden="true" />
      </button></li>)}
    </ul>}
    <div className="filter-subrow">
      <details className="extra-filters" open={secondaryFilters.some(filter => query.has(filter.key)) ? true : undefined}>
        <summary>Расстояние, ночёвка, карта и материалы <ChevronDown size={14} aria-hidden="true" /></summary>
        <div>
          {secondaryFilters.map(filter => <SelectFilter key={filter.key} filter={filter} query={query} change={change} />)}
        </div>
      </details>
      {active && <button className="quiet-button" type="button" onClick={() => setQuery(new URLSearchParams())}><X size={15} aria-hidden="true" /> Сбросить фильтры</button>}
    </div>
  </section>;
}

function SaveButton({ row, saved, toggle, large = false }) {
  const active = saved.has(row.id);
  return <button type="button" className={large ? "save-button save-wide" : "save-button"}
    onClick={() => toggle(row.id)} aria-pressed={active}
    aria-label={active ? `Убрать из сохранённых: ${row.title}` : `Сохранить: ${row.title}`}>
    <Bookmark size={large ? 19 : 21} strokeWidth={1.5} fill={active ? "currentColor" : "none"} aria-hidden="true" />
    {large && (active ? "Сохранено" : "Сохранить")}
  </button>;
}

function RouteCard({ row, lines, context, saved, toggle }) {
  const photo = photoFor(row);
  const [failedPhoto, setFailedPhoto] = useState(null);
  const activity = mainActivity(row);
  const { stops = [], galleries = [], videos = [] } = row.dossier || {};
  return <article className={`route-card region-${row.region}`}>
    <a className="card-photo" href={urlFor("place", context, row.id)} tabIndex={-1} aria-hidden="true">
      {photo && failedPhoto !== photo.file ? <>
        <img src={asset(`photos/${photo.file}`)} alt="" loading={prominent.includes(row.id) ? "eager" : "lazy"}
          onError={() => setFailedPhoto(photo.file)} />
        {photo.caption && <span>{photo.caption}</span>}
      </> : <RoutePreview row={row} lines={lines} />}
    </a>
    <div className="card-body">
      <div className="card-activity"><ActivityIcon activity={activity} size={17} />{activities[activity]}</div>
      <div className="card-heading">
        <h3><a href={urlFor("place", context, row.id)}>{row.title}</a></h3>
        <SaveButton row={row} saved={saved} toggle={toggle} />
      </div>
      <div className="card-meta">
        <span><MapPin size={15} aria-hidden="true" />{row.countries?.length > 1 ? row.countries.map(id => countries[id]).join(" · ") : regions[row.region]}</span>
        <span><Mountain size={15} aria-hidden="true" />{difficulty[row.level]}</span>
        <span><Clock3 size={15} aria-hidden="true" />{durationLabel(row.days)}</span>
      </div>
      <p>{row.summary}</p>
      <AccessNotice notice={row.dossier?.accessNotice} />
      <div className="card-media-meta">
        {stops.length > 0 && <span><MapIcon size={14} aria-hidden="true" />{stops.length === 1 ? "Точка на карте" : `Карта · ${stops.length}`}</span>}
        {(galleries.length > 0 || row.dossier?.photos?.length > 0 || row.dossier?.stageCover) && <span><Camera size={14} aria-hidden="true" />Фото</span>}
        {videos.length > 0 && <span><CirclePlay size={14} aria-hidden="true" />Видео</span>}
      </div>
    </div>
  </article>;
}

function DossierContacts({ contacts, sources }) {
  return <section className="dossier-contacts">
    <h2>Гиды, прокат и контакты</h2>
    <ul>
      {contacts.map(contact => {
        const href = contact.url || sources[contact.source].url;
        return <li key={contact.name}>
          <strong>{contact.name}</strong>
          <p>{contact.note}</p>
          <div className="dossier-links">
            <External href={href}>{href.startsWith("https://wa.me/") ? "WhatsApp" : "Сайт / условия"}</External>
            {contact.whatsapp && contact.whatsapp !== href && <External href={contact.whatsapp}>WhatsApp</External>}
            {contact.phone && <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a>}
            {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

function RoutePhoto({ photo, className, loading, onError }) {
  return <figure className={className}>
    <img src={asset(`photos/${photo.file}`)} alt={photo.alt} loading={loading} onError={onError} />
    {photo.caption && <figcaption>
      {photo.caption}
      {photo.original && <> · <External href={photo.original}>{photo.author}</External>
        {" · "}<External href={photo.licenseUrl}>{photo.license}</External></>}
    </figcaption>}
  </figure>;
}

function youtubeId(href) {
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const id = host === "youtu.be" ? parts[0]
    : (host === "youtube.com" || host === "m.youtube.com") &&
      (url.searchParams.get("v") || (["shorts", "embed", "live"].includes(parts[0]) && parts[1]));
  return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
}

function DossierMedia({ row, sources, byId, context }) {
  const [playing, setPlaying] = useState(null);
  const { photos = [], videos = [], galleries = [] } = row.dossier || {};
  const extraPhotos = photos.slice(1);
  const stopsWithMedia = (row.dossier?.mediaStops || []).map(id => byId.get(id));
  const country = row.countries?.[0] || "cr";
  const countryName = { cr: "Costa Rica", pa: "Panamá", ni: "Nicaragua" }[country];
  const query = encodeURIComponent(`${row.native.split(" · ")[0]} ${countryName}`);
  return <section className="dossier-section media-section">
    <h3>Фото и видео</h3>
    {extraPhotos.length > 0 && <div className="dossier-photo-grid">
      {extraPhotos.map(photo => <RoutePhoto key={photo.file} photo={photo} className="dossier-photo" loading="lazy" />)}
    </div>}
    {galleries.length > 0 && <ul className="media-list" aria-label="Галереи и фотоотчёты">
      {galleries.map(id => <li key={id}>
        <Camera size={19} aria-hidden="true" />
        <div><External href={sources[id].url}>{sources[id].title}</External><p>{sources[id].scope}</p></div>
      </li>)}
    </ul>}
    {videos.length > 0 && <ul className="media-list" aria-label="Видео">
      {videos.map(id => {
        const source = sources[id];
        const clip = youtubeId(source.url);
        return <li key={id}>
          <CirclePlay size={19} aria-hidden="true" />
          <div>
            <External href={source.url}>{source.title}</External>
            <p>{source.scope}</p>
            {clip && <button type="button" className="quiet-button media-play"
              aria-expanded={playing === id} onClick={() => setPlaying(playing === id ? null : id)}>
              {playing === id ? "Свернуть плеер" : "Смотреть в карточке"}
            </button>}
            {playing === id && <iframe className="media-player" title={source.title}
              src={`https://www.youtube-nocookie.com/embed/${clip}`} allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin" />}
          </div>
        </li>;
      })}
    </ul>}
    {stopsWithMedia.length > 0 && <details className="stage-media">
      <summary>Фото и видео на остановках</summary>
      <ul className="media-list">
        {stopsWithMedia.map(place => {
          const media = place.dossier;
          const photo = media.photos?.[0];
          const showPhoto = photo && photo.file !== row.dossier.stageCover?.file &&
            !photos.some(item => item.file === photo.file);
          const gallery = sources[media.galleries?.find(id => !galleries.includes(id))];
          const video = sources[media.videos?.find(id => !videos.includes(id))];
          return <li key={place.id}>
            <MapPin size={18} aria-hidden="true" />
            <div className="stage-media-entry">
              <div>
                <a href={urlFor("place", context, place.id)}>{place.title}</a>
                <div className="dossier-links">
                  {photo && !showPhoto && <External href={photo.original}>Снимок остановки</External>}
                  {gallery && <External href={gallery.url}><Camera size={13} aria-hidden="true" />Фотогалерея</External>}
                  {video && <External href={video.url}><CirclePlay size={13} aria-hidden="true" />Видео</External>}
                </div>
              </div>
              {showPhoto && <RoutePhoto photo={photo} className="dossier-photo stage-photo" loading="lazy" />}
            </div>
          </li>;
        })}
      </ul>
    </details>}
    <div className="media-search">
      {!photos.length && !galleries.length && !row.dossier?.stageCover && <External href={mapsLink(row)}>Поиск фотографий места на карте</External>}
      {!videos.length && <External href={`https://www.youtube.com/results?search_query=${query}`}>Поиск видео по названию места</External>}
    </div>
  </section>;
}

function RouteReports({ row, sources }) {
  const reports = (row.reportSources || []).map(id => sources[id]);
  const posts = row.posts || [];
  if (!reports.length && !posts.length) return null;
  return <section className="dossier-section">
    <h3>Отзывы, отчёты и упоминания</h3>
    <ul className="dossier-videos">
      {reports.map(source => <li key={source.id}>
        <External href={source.url}>{source.title}</External><p>{source.scope}</p>
      </li>)}
      {posts.map(post => <li key={post.url}>
        <External href={post.url}>{post.profile} · Instagram</External>
        <p>Публикация с упоминанием места</p>
      </li>)}
    </ul>
  </section>;
}

function Detail({ row, atlas, route, saved, toggle, activePlan, addRoute, useTemplate }) {
  const [failedPhoto, setFailedPhoto] = useState(null);
  const query = new URLSearchParams(route.filters);
  const from = query.get("from");
  query.delete("from");
  const back = urlFor(from in nav && from !== "sources" ? from : "catalog", query);
  const photo = photoFor(row);
  const inTrip = activePlan?.days.some(day => day.entries.some(entry => entry.recordId === row.id));
  const byId = new Map(atlas.records.map(r => [r.id, r]));
  const dossier = row.dossier;
  const line = atlas.lines?.[dossier?.line];
  const stats = [
    [Clock3, "Длительность", durationLabel(row.days) + (row.distance ? ` · ${String(row.distance).replace(".", ",")} км` : "")],
    [Mountain, "Сложность", difficulty[row.level]],
    [CarFront, "Подъезд", row.access.map(id => accessModes[id]).join(", ")],
    [Users, "С кем", row.audience.map(id => audiences[id]).join(", ")],
  ];
  return <>
    <a href={back} className="back-link"><ArrowLeft size={18} /> {from === "trips" ? "К моим поездкам" : "К каталогу"}</a>
    <section className="detail-hero">
      <div>
        <h1>{row.title}</h1>
        <p className="detail-location"><ActivityIcon activity={mainActivity(row)} />{row.countries?.length > 1 ? row.countries.map(id => countries[id]).join(" → ") : regions[row.region]} · {kinds[row.kind]}</p>
        <p className="native-name" lang="es">{row.native}</p>
        <p className="detail-intro">{row.summary}</p>
        <AccessNotice notice={dossier?.accessNotice} sources={atlas.sources} />
        <div className="detail-controls">
          <SaveButton row={row} saved={saved} toggle={toggle} large />
          <button type="button" className="save-button save-wide" onClick={() => {
            if (inTrip) window.location.hash = "trips";
            else addRoute(row.id);
          }}>
            {!inTrip && <Plus size={18} aria-hidden="true" />}{inTrip ? "Открыть поездку" : "Добавить в поездку"}
          </button>
          {row.stages?.length > 1 && <button type="button" className="save-button save-wide" onClick={() => useTemplate(row)}>
            Взять за основу поездки
          </button>}
        </div>
      </div>
      {photo && failedPhoto !== photo.file
        ? <RoutePhoto photo={photo} className="detail-photo" onError={() => setFailedPhoto(photo.file)} />
        : <RoutePreview row={row} lines={atlas.lines} />}
    </section>
    <dl className="details-stats">
      {stats.map(([Icon, label, value]) => <div key={label}>
        <Icon size={26} strokeWidth={1.6} aria-hidden="true" />
        <div><dt>{label}</dt><dd>{value}</dd></div>
      </div>)}
    </dl>
    {Boolean(dossier?.stops.length) && <Suspense fallback={<p role="status">Загружаем карту…</p>}>
      <RouteMap key={row.id} record={row} stops={dossier.stops} track={atlas.sources[dossier.track]} line={line}
        lines={atlas.lines} sources={atlas.sources} connectStops={dossier.connectStops} />
    </Suspense>}
    <div className="detail-body">
      <section>
        <h2>Как спланировать</h2>
        <h3>{row.stageUnit === "stage" ? "План по этапам" : row.stages ? "План по дням" : "Маршрут"}</h3>
        <p>{row.plan}</p>
        {row.stages?.length > 0 && <ol className="stages">{row.stages.map(stage => <li key={stage.day}>
          <strong>{row.stageUnit === "stage" ? "Этап" : "День"} {stage.day} · {stage.title}</strong>
          <p>{stage.note}</p>
          {Boolean(stage.stops.length || stage.sources?.length) && <div className="stage-links">
            {stage.stops.map(stop => <a key={stop} href={urlFor("place", route.filters, stop)}>{byId.get(stop)?.title}<ArrowRight size={13} /></a>)}
            {stage.sources?.map(id => <External key={id} href={atlas.sources[id].url}>{atlas.sources[id].title}</External>)}
          </div>}
        </li>)}</ol>}
        <h3>Ночёвка</h3>
        <p>{row.sleep.map(id => lodging[id]).join(" · ")}</p>
        <h3>Активности</h3>
        <div className="activity-links">{row.activities.map(id => <a key={id} href={urlFor("catalog", new URLSearchParams({ activity: id }))}><ActivityIcon activity={id} size={14} />{activities[id]}</a>)}</div>
        {dossier?.sections.map(section => <section className="dossier-section" key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.text}</p>
          <div className="dossier-links">{section.sources.map(id => <External href={atlas.sources[id].url} key={id}>{atlas.sources[id].title}</External>)}</div>
        </section>)}
        <DossierMedia key={row.id} row={row} sources={atlas.sources} byId={byId} context={route.filters} />
        <RouteReports row={row} sources={atlas.sources} />
        {Boolean(dossier?.nearby?.length) && <section className="dossier-section">
          <h3>Что добавить к поездке</h3>
          <ul>{dossier.nearby.map(id => <li key={id}><a href={urlFor("place", route.filters, id)}>{byId.get(id).title}</a></li>)}</ul>
        </section>}
      </section>
      <aside>
        {Boolean(dossier?.contacts.length) && <DossierContacts contacts={dossier.contacts} sources={atlas.sources} />}
        <div className="sources-box">
          <h2>Источники и карта</h2>
          <p className="check-date">Сверено {new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" }).format(new Date(row.checked))}</p>
          <ul>
            {row.sources.map(id => atlas.sources[id]).map(source => <li key={source.id}>
              <External href={source.url}>{source.title}</External>
              <p>{sourceKinds[source.kind]} · {source.scope}</p>
            </li>)}
          </ul>
          <External className="map-link" href={mapsLink(row)}><MapPin size={19} aria-hidden="true" /> Открыть карту и отзывы</External>
        </div>
      </aside>
    </div>
    <section className="departure"><h2>Перед выездом</h2><p>{row.conditions}</p></section>
  </>;
}

function ReadPublisherPages({ pages }) {
  const [open, setOpen] = useState(false);
  if (!pages?.length) return null;
  return <details className="profile-copy-items publisher-read-pages" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Прочитанные страницы · {pages.length}</summary>
    {open && <ul>
      {pages.map(page => <li key={page.url}>
        <External href={page.url}>{page.title}</External>
        {page.published && <> · <time dateTime={page.published}>{page.published.split("-").reverse().join(".")}</time></>}
        {page.checked && <> · сверено <time dateTime={page.checked}>{page.checked.split("-").reverse().join(".")}</time></>}
      </li>)}
    </ul>}
  </details>;
}

function SourcesPage({ atlas }) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("");
  const [coverage, setCoverage] = useState("");
  const { overview, publisherReview } = atlas.social;
  const measurementDate = atlas.social.profiles[0]?.countChecked;
  const needle = fold(query.trim());
  const followerFormat = new Intl.NumberFormat("ru-RU");
  const browserCheckLabels = {
    "feed-visible": "Виден текст публикаций",
    "grid-visible": "Видна сетка публикаций",
    "profile-only": "Открыт профиль",
    "login-required": "Запрошен вход",
  };
  const profiles = atlas.social.profiles.filter(row =>
    (!platform || row.platform === platform) &&
    (coverage !== "posts" || row.posts > 0 || row.postLinks?.length) &&
    (coverage !== "missing" || row.posts === 0 && !row.postLinks?.length) &&
    (coverage !== "originals" || row.postLinks?.length) &&
    (coverage !== "multiple-originals" || row.postLinks?.length > 1) &&
    (coverage !== "archive" || row.publisher?.archive) &&
    (coverage !== "publisher-pages" || row.publisher?.coverage?.pages?.length) &&
    (coverage !== "copies" || row.copySample) &&
    (coverage !== "live" || row.liveCheck) &&
    (coverage !== "text-unconfirmed" || row.liveCheck && row.liveCheck.status !== "feed-visible") &&
    (coverage !== "live-pending" || !row.liveCheck) &&
    fold([row.name, row.url, row.category, row.zone, row.platform, atlas.sources[row.publisher?.site]?.url].join(" ")).includes(needle)
  );
  const withPhotos = atlas.records.filter(row => row.dossier?.photos?.length || row.dossier?.stageCover).length;
  const withVideos = atlas.records.filter(row => row.dossier?.videos?.length).length;
  const withGalleries = atlas.records.filter(row => row.dossier?.galleries?.length).length;
  const withMaps = atlas.records.filter(row => row.dossier?.stops.length).length;
  const withRouteLines = atlas.records.filter(row => row.dossier?.line).length;
  const withExternalTracks = atlas.records.filter(row => row.dossier?.trackKind === "track").length;
  const withExternalMaps = atlas.records.filter(row => row.dossier?.trackKind === "map").length;
  const withReports = atlas.records.filter(row => row.reportSources?.length || row.posts?.length).length;
  const guideLanguages = { es: "На испанском", en: "На английском", "es-en": "На испанском и английском" };
  return <section className="sources-page">
    <h1>Источники</h1>
    <p className="page-lede">Проверки доступа, правила площадок и опыт путешественников.</p>
    <div className="source-summary">
      <article><strong>{overview.profiles || 0}</strong><span>профилей в реестре</span></article>
      <article><strong>{overview.instagramUniquePosts}</strong><span>уникальных постов Instagram в выборке</span></article>
      <article><strong>{overview.facebookPosts}</strong><span>постов Facebook открыто</span></article>
      <article><strong>{Object.keys(atlas.sources).length}</strong><span>источников каталога</span></article>
    </div>
    <p>Подключённый коннектор Meta читает управляемые аккаунты. В рейтинге указаны образцы подписей, оригиналы, открытые копии и результат проверки браузером. {overview.instagramOpenedPosts > 0 && `Сейчас по прямым ссылкам проверено ${overview.instagramOpenedPosts} публикаций Instagram из ${overview.instagramWithOpenedPosts} профилей.`}</p>
    <p><External href="https://github.com/Paldd/costa-rica-travel-atlas/blob/main/docs/API.md">Проверка доступов и методика</External>{" · "}
      <External href="https://github.com/Paldd/costa-rica-travel-atlas/actions/workflows/refresh.yml">Ежедневное чтение открытых архивов</External></p>
    <details className="evidence-list">
      <summary>Рейтинг Instagram и Facebook <ChevronDown size={18} /></summary>
      <p>По {overview.instagramProfiles} профилей на каждой платформе с аудиторией свыше 1 000 подписчиков. Замер от <time dateTime={measurementDate}>{measurementDate?.split("-").reverse().join(".")}</time>.</p>
      {overview.browserChecks > 0 && <p>Результат открытия профиля в браузере отмечен у {overview.browserChecks} страниц. Текст авторских публикаций был виден у {overview.visibleBrowserFeeds} из них.</p>}
      {overview.instagramWithMultipleOpenedPosts > 0 && <p>У {overview.instagramWithMultipleOpenedPosts} профилей Instagram прочитано по несколько оригиналов. Период в строке профиля показывает крайние даты среди прочитанных публикаций с видимой датой.</p>}
      {overview.facebookWithCopies > 0 && <p>В открытых копиях лент изучено {overview.facebookCopiedPosts} публикаций для {overview.facebookWithCopies} профилей. Период выборки указан в строке профиля.</p>}
      {overview.publisherLinks > 0 && <p>У {overview.publisherLinks} профилей есть подтверждённый сайт. Для {overview.publisherArchiveLinks} профилей доступны ссылки на разделы статей, маршрутов или программ этого проекта.</p>}
      {publisherReview && <p>
        Уникальные страницы издателей, прочитанные за проход от{" "}
        <time dateTime={publisherReview.dayUtc}>{publisherReview.dayUtc.split("-").reverse().join(".")}</time> — {publisherReview.pagesRead}.
        {" "}Всего прочитанных страниц — {publisherReview.pagesReadToDate}.{" "}
        <External href={publisherReview.runUrl}>Отчёт обхода</External>
      </p>}
      <div className="profile-filters">
        <label className="search-box"><Search size={19} aria-hidden="true" /><span className="visually-hidden">Поиск соцпрофиля</span>
          <input type="search" value={query} placeholder="Профиль, сайт, регион или категория" onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="profile-platform">
          <select aria-label="Платформа" value={platform} onChange={event => setPlatform(event.target.value)}>
            <option value="">Обе платформы</option>
            <option>Instagram</option>
            <option>Facebook</option>
          </select>
        </div>
        <div className="profile-platform">
          <select aria-label="Материалы профиля" value={coverage} onChange={event => setCoverage(event.target.value)}>
            <option value="">Любое покрытие</option>
            <option value="posts">Есть выборка постов</option>
            <option value="originals">Открыты прямые публикации</option>
            <option value="multiple-originals">Прочитано несколько оригиналов</option>
            <option value="missing">Без прямой выборки постов</option>
            <option value="copies">Есть прочитанные копии</option>
            <option value="archive">Есть архив сайта</option>
            <option value="publisher-pages">Есть прочитанные страницы сайта</option>
            <option value="live">С отметкой проверки ленты</option>
            <option value="text-unconfirmed">Текст автора пока не подтверждён</option>
            <option value="live-pending">Без отметки проверки ленты</option>
          </select>
        </div>
      </div>
      <p className="profile-status" role="status">Профилей по запросу: {profiles.length}</p>
      <div className="profiles-list">
        {profiles.map(row => <div key={row.url}>
          <div className="profile-identity">
            <External href={row.url}>{row.name}</External>
            <span>{row.category} · {row.zone}</span>
          </div>
          <div className="profile-count">
            <span>{row.platform} · № {row.rank}</span>
            <External href={row.countSource}>{row.precision === "round" ? "≈ " : ""}{followerFormat.format(row.followers)} подписчиков</External>
          </div>
          <div className="profile-coverage">
            <span>{row.posts > 0
              ? row.platform === "Instagram" ? `Подписей в выборке: ${row.posts}` : `Публикаций открыто: ${row.posts}`
              : row.about ? "Прочитано описание" : "Подтверждена карточка"}</span>
            {row.postLinks?.length > 1 && <span>Оригиналов прочитано {row.postLinks.length}{row.postPeriod && <> · <time dateTime={row.postPeriod.first}>{row.postPeriod.first.split("-").reverse().join(".")}</time>
              {row.postPeriod.first !== row.postPeriod.last && <>–<time dateTime={row.postPeriod.last}>{row.postPeriod.last.split("-").reverse().join(".")}</time></>}</>}</span>}
            {row.postLinks?.map(({ source, checked, published }) =>
              <External key={source} href={atlas.sources[source].url}>{atlas.sources[source].title} · {published ? "опубликовано " : "проверено "}<time dateTime={published || checked}>{(published || checked).split("-").reverse().join(".")}</time></External>)}
            {row.liveCheck && <span>{browserCheckLabels[row.liveCheck.status]} · <time dateTime={row.liveCheck.checked}>{row.liveCheck.checked.split("-").reverse().join(".")}</time>. {row.liveCheck.detail}</span>}
            {row.copySample && <External href={atlas.sources[row.copySample.source].url}>
              {row.copySample.count} публикаций в копии ленты · {row.copySample.first} — {row.copySample.last}
            </External>}
            {row.publisher && <External href={atlas.sources[row.publisher.site].url}>Сайт проекта</External>}
            {row.publisher?.archive && <External href={atlas.sources[row.publisher.archive].url}>Статьи и маршруты проекта</External>}
            {row.publisher?.coverage?.indexed != null && <span>В архиве прочитано {row.publisher.coverage.read} из {row.publisher.coverage.indexed} обнаруженных страниц</span>}
            {row.publisher?.coverage?.indexed === null && <span>Страницы из предыдущих обходов</span>}
          </div>
          <ReadPublisherPages pages={row.publisher?.coverage?.pages} />
          {row.copySample?.items?.length > 0 && <details className="profile-copy-items">
            <summary>Что было в просмотренных публикациях</summary>
            <ul>{row.copySample.items.map(({ published, summary, record }) =>
              <li key={published + summary}><time dateTime={published}>{published.split("-").reverse().join(".")}</time>{" · "}
                {summary}{record && <> <a href={urlFor("place", new URLSearchParams(), record)}>Карточка</a></>}
              </li>
            )}</ul>
          </details>}
        </div>)}
      </div>
    </details>
    {Object.keys(publisherReview?.guidePages || {}).length > 0 && <details className="evidence-list">
      <summary>Прочитанные страницы путеводителей <ChevronDown size={18} /></summary>
      <div className="source-directory">
        {Object.entries(publisherReview.guidePages).map(([source, pages]) => <div key={source}>
          <External href={atlas.sources[source].url}>{atlas.sources[source].title}</External>
          <ReadPublisherPages pages={pages} />
        </div>)}
      </div>
    </details>}
    {Boolean(atlas.guides?.length) && <details className="evidence-list" open>
      <summary>Путеводители на испанском и английском <ChevronDown size={18} /></summary>
      {Object.entries(guideLanguages).map(([language, label]) => <section key={language}>
        <h3>{label}</h3>
        <div className="source-directory">{atlas.guides.filter(guide => guide.language === language).map(guide => <div key={guide.url}>
          <External href={guide.url}>{guide.name}</External><p>{guide.focus}</p>
        </div>)}</div>
      </section>)}
    </details>}
    <details className="evidence-list"><summary>Парки, операторы и путеводители <ChevronDown size={18} /></summary>
      <div className="source-directory">{Object.values(atlas.sources).map(source => <div key={source.id}>
        <External href={source.url}>{source.title}</External><p>{source.scope}</p>
      </div>)}</div>
    </details>
    <details className="evidence-list"><summary>Фото, видео и отзывы <ChevronDown size={18} /></summary>
      <p>В {withPhotos} из {atlas.records.length} карточек показан снимок места или остановки с указанием автора. В {withVideos} есть ссылки на ролики о месте или маршруте.</p>
      <div className="dossier-links">
        <a href={urlFor("catalog", new URLSearchParams({ material: "photo-video" }))}><Camera size={15} aria-hidden="true" />Фото и видео</a>
        <a href={urlFor("catalog", new URLSearchParams({ material: "missing-photo" }))}>Без снимка в атласе · {atlas.records.length - withPhotos}</a>
        <a href={urlFor("catalog", new URLSearchParams({ material: "missing-video" }))}>Без прямого видео · {atlas.records.length - withVideos}</a>
      </div>
      <p>Точки с источниками координат есть в {withMaps} карточках. Линия маршрута есть в {withRouteLines}, внешний GPS-трек — в {withExternalTracks}, внешняя схема — в {withExternalMaps}.</p>
      {withGalleries > 0 && <p>Ссылки на фотографии авторов и операторов есть в {withGalleries} карточках.</p>}
      {withReports > 0 && <p>Отзывы, отчёты или прямые упоминания собраны в {withReports} карточках.</p>}
      <p><External href="https://github.com/Paldd/costa-rica-travel-atlas/blob/main/docs/MEDIA.md">Авторы, лицензии и иллюстрации</External></p>
    </details>
  </section>;
}

function CatalogPage({ atlas, route, setQuery, saved, toggle }) {
  const { page, filters: query } = route;
  const [limit, setLimit] = useState(12);
  const searchKey = query.toString() + page;
  useEffect(() => setLimit(12), [searchKey]);
  const map = query.get("view") === "map";
  const displayQuery = new URLSearchParams(query);
  displayQuery.delete("view");
  const active = displayQuery.size > 0;
  const context = new URLSearchParams(query);
  if (page !== "catalog") context.set("from", page);
  const detailContext = context.toString();
  const linkTo = useCallback(id => urlFor("place", new URLSearchParams(detailContext), id), [detailContext]);
  const records = useMemo(() => {
    const sorted = [...atlas.records].sort((a, b) => {
      const aRank = prominent.includes(a.id) ? prominent.indexOf(a.id) : prominent.length;
      const bRank = prominent.includes(b.id) ? prominent.indexOf(b.id) : prominent.length;
      return aRank - bRank;
    });
    return visibleRecords(sorted, query, page, saved);
  }, [atlas, searchKey, saved, page]);
  const title = page === "expeditions" ? "Экспедиции" : page === "saved" ? "Сохранённое" : "Каталог маршрутов";
  function switchView(value) {
    const next = new URLSearchParams(query);
    if (value === "map") next.set("view", value);
    else next.delete("view");
    setQuery(next);
  }
  return <>
    {page === "catalog" ? <Hero /> : <div className="subpage-heading"><h1>{title}</h1></div>}
    <SearchFilters query={query} setQuery={setQuery} active={active} />
    <div className="catalog-heading">
      <div>
        {page === "catalog" && <h2>{title}</h2>}
        <p aria-live="polite">{records.length} {page === "expeditions" ? "в подборке" : "в каталоге"}</p>
      </div>
      <div className="view-toggle" aria-label="Вид каталога">
        <button type="button" aria-pressed={!map} onClick={() => switchView("list")}><List size={17} aria-hidden="true" /> Список</button>
        <button type="button" aria-pressed={map} onClick={() => switchView("map")}><MapIcon size={17} aria-hidden="true" /> Карта</button>
      </div>
    </div>
    {records.length === 0 ? <div className="empty">
      <Compass size={28} aria-hidden="true" />
      <h3>{page === "saved" && saved.size === 0 ? "Добавьте маршрут в сохранённое" : "Маршруты не найдены"}</h3>
      {active
        ? <button type="button" className="button primary" onClick={() => setQuery(new URLSearchParams())}>Сбросить фильтры</button>
        : <a href="#catalog" className="button primary">Открыть каталог</a>}
    </div> : <>
      {map && <Suspense fallback={<p className="loading" role="status">Загружаем карту…</p>}>
        <AtlasMap records={records} lines={atlas.lines} sources={atlas.sources} linkTo={linkTo}
          current={query.get("region")} onSelect={region => {
            const next = new URLSearchParams(query);
            if (region && region !== query.get("region")) next.set("region", region);
            else next.delete("region");
            setQuery(next);
          }} />
      </Suspense>}
      <div className="cards">
        {records.slice(0, limit).map(row => <RouteCard key={row.id} row={row} lines={atlas.lines} context={context} saved={saved} toggle={toggle} />)}
      </div>
      {records.length > limit && <div className="more-row">
        <button type="button" className="button secondary" onClick={() => setLimit(count => count + 18)}>Показать ещё</button>
        <span>Показано {limit} из {records.length}</span>
      </div>}
    </>}
  </>;
}

function App() {
  const [atlas, setAtlas] = useState(null);
  const [error, setError] = useState(false);
  const [route, setQuery] = useRoute();
  const [saved, setSaved] = useState(initialSaves);
  const [tripPlans, setTripPlans] = useState(initialTripPlans);
  const [storageError, setStorageError] = useState(false);
  const activePlan = tripPlans.trips.find(plan => plan.id === tripPlans.activeId);

  function updatePlans(change) {
    const result = saveTripPlans(tripPlans, current => change(resolveTripRoutes(current, atlas?.recordAliases)), !storageError);
    setTripPlans(result.plans);
    setStorageError(!result.stored);
  }

  function createTrip(template) {
    const plan = newTrip(template);
    updatePlans(current => selectNewTrip(current, plan));
    window.location.hash = "trips";
  }
  const main = useRef(null);
  useEffect(() => {
    fetch(asset("atlas.json"), { cache: "no-cache" }).then(response => {
      if (!response.ok) throw new Error("catalog");
      return response.json();
    }).then(data => {
      const aliases = data.recordAliases;
      setSaved(current => new Set([...current].map(id => resolveRecordId(id, aliases))));
      setTripPlans(current => resolveTripRoutes(current, aliases));
      setAtlas(data);
    }).catch(() => setError(true));
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (route.page === "place") main.current?.focus({ preventScroll: true });
  }, [route.page, route.id]);

  function toggle(id) {
    setSaved(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem("cr-atlas-saved", JSON.stringify([...next])); } catch {}
      return next;
    });
  }
  const recordId = resolveRecordId(route.id, atlas?.recordAliases);
  const record = atlas?.records.find(row => row.id === recordId);
  useEffect(() => {
    document.title = record ? record.title + " · Атлас Коста-Рики" : "Атлас Коста-Рики";
  }, [record]);
  return <>
    <Header page={route.page} saved={saved.size} />
    <main className="wrap main" ref={main} tabIndex={-1} id="main-content">
      {error ? <div className="empty"><h1>Каталог не загрузился</h1><button type="button" className="button primary" onClick={() => location.reload()}>Повторить</button></div>
        : !atlas ? <p className="loading" role="status">Загружаем маршруты…</p>
        : route.page === "place" ? record ? <Detail key={record.id} row={record} atlas={atlas} route={route} saved={saved} toggle={toggle}
          activePlan={activePlan} addRoute={id => updatePlans(state => addRouteToTrip(state, id))} useTemplate={createTrip} />
          : <div className="empty"><h1>Карточка не найдена</h1><a className="button primary" href="#catalog">К каталогу</a></div>
        : route.page === "sources" ? <SourcesPage atlas={atlas} />
        : route.page === "trips" ? <Suspense fallback={<p className="loading" role="status">Загружаем поездки…</p>}>
          <TripPlanner atlas={atlas} plans={tripPlans} storageError={storageError} linkTo={placeInPlanner}
            create={createTrip} select={id => updatePlans(state => ({ ...state, activeId: id }))}
            remove={id => updatePlans(state => {
              const trips = state.trips.filter(trip => trip.id !== id);
              return { trips, activeId: id === state.activeId ? trips[0]?.id || "" : state.activeId };
            })}
            edit={(id, change) => updatePlans(state => editTrip(state, id, change))} />
        </Suspense>
        : <CatalogPage atlas={atlas} route={route} setQuery={setQuery} saved={saved} toggle={toggle} />}
    </main>
    <footer className="wrap">
      <a className="brand" href="#catalog"><Mountain aria-hidden="true" />Атлас Коста-Рики</a>
      <div><a href="#sources">Источники</a><External href="https://github.com/Paldd/costa-rica-travel-atlas">Проект на GitHub</External></div>
    </footer>
  </>;
}

createRoot(document.getElementById("root")).render(<App />);
