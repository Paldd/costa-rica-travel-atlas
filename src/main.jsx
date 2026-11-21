import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Clock3, Compass, List,
  Map as MapIcon, MapPin, Mountain, Search, Users, CarFront, ChevronDown, X,
} from "lucide-react";
import {
  accessModes, activities, audiences, difficulty, durationLabel, filters, fold, kinds,
  lodging, mapsLink, regions, secondaryFilters, sourceKinds, visibleRecords,
} from "./catalog.js";
import AtlasMap from "./AtlasMap.jsx";
import "./styles.css";

const asset = name => import.meta.env.BASE_URL + name;
const nav = { catalog: "Каталог", expeditions: "Экспедиции", sources: "Источники", saved: "Сохранённое" };
const heroImage = { file: "arenal.jpg", alt: "Иллюстрация вулкана Ареналь над тропическим лесом" };
const pictures = {
  "sabana-oka": { file: "sabana.jpg", alt: "Иллюстрация открытого горного ландшафта Таламанки", caption: "Иллюстрация ландшафта" },
  chirripo: { file: "chirripo.jpg", alt: "Иллюстрация высокогорного парамо Чиррипо", caption: "Иллюстрация ландшафта" },
  "marino-ballena": { file: "uvita.jpg", alt: "Иллюстрация берега Марино-Бальена в районе Увиты", caption: "Иллюстрация ландшафта" },
};
const prominent = ["sabana-oka", "chirripo", "marino-ballena"];
const photoFor = row => pictures[row.id] || (row.native.includes("Arenal") ? { ...heroImage, caption: "Иллюстрация Ареналя" } : undefined);

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
  const search = query.get("q") || "";
  function change(key, value) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    setQuery(next);
  }
  return <section className="search-area" aria-label="Фильтры каталога">
    <label className="search-box" htmlFor="route-search">
      <Search size={23} strokeWidth={1.6} aria-hidden="true" />
      <span className="visually-hidden">Поиск маршрута, места или активности</span>
      <input id="route-search" type="search" placeholder="Поиск маршрута, места или активности"
        value={search} onChange={event => change("q", event.target.value)} />
    </label>
    <div className="filter-row">
      {filters.map(filter => <SelectFilter key={filter.key} filter={filter} query={query} change={change} />)}
    </div>
    <div className="filter-subrow">
      <details className="extra-filters" open={query.has("sleep") || query.has("kind") ? true : undefined}>
        <summary>Ночёвка и вид записи <ChevronDown size={14} aria-hidden="true" /></summary>
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

function RouteCard({ row, context, saved, toggle }) {
  const photo = photoFor(row);
  return <article className={`route-card region-${row.region}`}>
    {photo && <a className="card-photo" href={urlFor("place", context, row.id)} tabIndex={-1} aria-hidden="true">
      <img src={asset(`photos/${photo.file}`)} alt="" loading={prominent.includes(row.id) ? "eager" : "lazy"} />
      {photo.caption && <span>{photo.caption}</span>}
    </a>}
    <div className="card-body">
      <div className="card-heading">
        <h3><a href={urlFor("place", context, row.id)}>{row.title}</a></h3>
        <SaveButton row={row} saved={saved} toggle={toggle} />
      </div>
      <div className="card-meta">
        <span><MapPin size={15} aria-hidden="true" />{regions[row.region]}</span>
        <span><Mountain size={15} aria-hidden="true" />{difficulty[row.level]}</span>
        <span><Clock3 size={15} aria-hidden="true" />{durationLabel(row.days)}</span>
      </div>
      <p>{row.summary}</p>
    </div>
  </article>;
}

function Detail({ row, atlas, route, saved, toggle }) {
  const query = new URLSearchParams(route.filters);
  const from = query.get("from");
  query.delete("from");
  const back = urlFor(from in nav && from !== "sources" ? from : "catalog", query);
  const photo = photoFor(row);
  const byId = new Map(atlas.records.map(r => [r.id, r]));
  const stats = [
    [Clock3, "Длительность", durationLabel(row.days) + (row.distance ? ` · ${String(row.distance).replace(".", ",")} км` : "")],
    [Mountain, "Сложность", difficulty[row.level]],
    [CarFront, "Подъезд", row.access.map(id => accessModes[id]).join(", ")],
    [Users, "С кем", row.audience.map(id => audiences[id]).join(", ")],
  ];
  return <>
    <a href={back} className="back-link"><ArrowLeft size={18} /> К каталогу</a>
    <section className={`detail-hero ${photo ? "" : "no-photo"}`}>
      <div>
        <h1>{row.title}</h1>
        <p className="detail-location">{regions[row.region]} · {kinds[row.kind]}</p>
        <p className="native-name" lang="es">{row.native}</p>
        <p className="detail-intro">{row.summary}</p>
        <SaveButton row={row} saved={saved} toggle={toggle} large />
      </div>
      {photo && <figure className="detail-photo">
        <img src={asset(`photos/${photo.file}`)} alt={photo.alt} />
        {photo.caption && <figcaption>{photo.caption}</figcaption>}
      </figure>}
    </section>
    <dl className="details-stats">
      {stats.map(([Icon, label, value]) => <div key={label}>
        <Icon size={26} strokeWidth={1.6} aria-hidden="true" />
        <div><dt>{label}</dt><dd>{value}</dd></div>
      </div>)}
    </dl>
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
        <div className="activity-links">{row.activities.map(id => <a key={id} href={urlFor("catalog", new URLSearchParams({ activity: id }))}>{activities[id]}</a>)}</div>
      </section>
      <aside className="sources-box">
        <h2>Источники и карта</h2>
        <p className="check-date">Сверено {new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" }).format(new Date(row.checked))}</p>
        <ul>
          {row.sources.map(id => atlas.sources[id]).map(source => <li key={source.id}>
            <External href={source.url}>{source.title}</External>
            <p>{sourceKinds[source.kind]} · {source.scope}</p>
          </li>)}
          {row.posts?.map(post => <li key={post.url}>
            <External href={post.url}>{post.profile} · Instagram</External>
            <p>Публикация с упоминанием места</p>
          </li>)}
        </ul>
        <External className="map-link" href={mapsLink(row)}><MapPin size={19} aria-hidden="true" /> Открыть карту и отзывы</External>
      </aside>
    </div>
    <section className="departure"><h2>Перед выездом</h2><p>{row.conditions}</p></section>
  </>;
}

function SourcesPage({ atlas }) {
  const [query, setQuery] = useState("");
  const overview = atlas.social.overview || {};
  const profiles = (atlas.social.profiles || []).filter(row => fold(row.name + " " + row.platform).includes(fold(query)));
  return <section className="sources-page">
    <h1>Источники</h1>
    <p className="page-lede">Проверки доступа, правила площадок и опыт путешественников.</p>
    <div className="source-summary">
      <article><strong>{overview.profiles || 0}</strong><span>профилей в реестре</span></article>
      <article><strong>{overview.instagramPosts || 0}</strong><span>постов Instagram в выборке</span></article>
      <article><strong>{overview.facebookPosts || 0}</strong><span>постов Facebook просмотрено</span></article>
      <article><strong>{Object.keys(atlas.sources).length}</strong><span>источников каталога</span></article>
    </div>
    <p>Подключённый коннектор Meta читает управляемые аккаунты. Публикации сторонних профилей сверяются по доступным образцам и ссылкам. Статус в строке показывает, какие данные просмотрены.</p>
    <p><External href="https://github.com/Paldd/costa-rica-travel-atlas/blob/main/docs/API.md">Проверка доступов и методика</External></p>
    <details className="evidence-list">
      <summary>Профили Instagram и Facebook <ChevronDown size={18} /></summary>
      <label className="search-box"><Search size={19} aria-hidden="true" /><span className="visually-hidden">Поиск соцпрофиля</span>
        <input type="search" value={query} placeholder="Найти профиль" onChange={event => setQuery(event.target.value)} /></label>
      <div className="profiles-list">
        {profiles.map(row => <div key={row.url}>
          <External href={row.url}>{row.name}</External><span>{row.platform}</span>
          <span>{row.posts > 0 ? `${row.posts} в выборке постов` : row.about ? "Прочитано описание" : "Подтверждена карточка"}</span>
        </div>)}
        {!profiles.length && <p>Совпадений по этому запросу нет.</p>}
      </div>
    </details>
    <details className="evidence-list"><summary>Парки, операторы и путеводители <ChevronDown size={18} /></summary>
      <div className="source-directory">{Object.values(atlas.sources).map(source => <div key={source.id}>
        <External href={source.url}>{source.title}</External><p>{source.scope}</p>
      </div>)}</div>
    </details>
    <details className="evidence-list"><summary>Фотографии и карта <ChevronDown size={18} /></summary>
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
      {map && <AtlasMap records={records} current={query.get("region")} onSelect={region => {
        const next = new URLSearchParams(query);
        if (region && region !== query.get("region")) next.set("region", region);
        else next.delete("region");
        setQuery(next);
      }} />}
      <div className="cards">
        {records.slice(0, limit).map(row => <RouteCard key={row.id} row={row} context={context} saved={saved} toggle={toggle} />)}
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
  const main = useRef(null);
  useEffect(() => {
    fetch(asset("atlas.json")).then(response => {
      if (!response.ok) throw new Error("catalog");
      return response.json();
    }).then(setAtlas).catch(() => setError(true));
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
  const record = atlas?.records.find(row => row.id === route.id);
  useEffect(() => {
    document.title = record ? record.title + " · Атлас Коста-Рики" : "Атлас Коста-Рики";
  }, [record]);
  return <>
    <Header page={route.page} saved={saved.size} />
    <main className="wrap main" ref={main} tabIndex={-1} id="main-content">
      {error ? <div className="empty"><h1>Каталог не загрузился</h1><button type="button" className="button primary" onClick={() => location.reload()}>Повторить</button></div>
        : !atlas ? <p className="loading" role="status">Загружаем маршруты…</p>
        : route.page === "place" ? record ? <Detail row={record} atlas={atlas} route={route} saved={saved} toggle={toggle} />
          : <div className="empty"><h1>Карточка не найдена</h1><a className="button primary" href="#catalog">К каталогу</a></div>
        : route.page === "sources" ? <SourcesPage atlas={atlas} />
        : <CatalogPage atlas={atlas} route={route} setQuery={setQuery} saved={saved} toggle={toggle} />}
    </main>
    <footer className="wrap">
      <a className="brand" href="#catalog"><Mountain aria-hidden="true" />Атлас Коста-Рики</a>
      <div><a href="#sources">Источники</a><External href="https://github.com/Paldd/costa-rica-travel-atlas">Проект на GitHub</External></div>
    </footer>
  </>;
}

createRoot(document.getElementById("root")).render(<App />);
