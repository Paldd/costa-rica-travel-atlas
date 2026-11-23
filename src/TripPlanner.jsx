import React, { useMemo } from "react";
import { ArrowDown, ArrowUp, CalendarDays, Download, MapPin, Plus, X } from "lucide-react";
import { appendTripDay, dateForDay } from "./tripPlans.js";
import { durationLabel } from "./catalog.js";
import { downloadFile, escapeMarkup as escapeHtml } from "./downloads.js";
import { downloadGpx } from "./gpx.js";
import AccessNotice from "./AccessNotice.jsx";
const cardUrl = id => new URL("#place/" + encodeURIComponent(id), window.location.href).href;

function renderStop(record, sources, visited = false) {
  if (!record) return "";
  const points = (record.dossier?.stops || []).map(stop => {
    const coords = stop.coords.map(number => number.toFixed(6)).join(", ");
    const link = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(coords);
    return "<li>" + escapeHtml(stop.role) + " · " + escapeHtml(stop.name)
      + ' · <a href="' + escapeHtml(link) + '">' + escapeHtml(coords) + "</a></li>";
  }).join("");
  const contacts = (record.dossier?.contacts || []).map(contact => {
    const link = contact.url || sources[contact.source]?.url;
    return '<li><a href="' + escapeHtml(link) + '">' + escapeHtml(contact.name) + "</a>"
      + (contact.whatsapp && contact.whatsapp !== link ? ' · <a href="' + escapeHtml(contact.whatsapp) + '">WhatsApp</a>' : "")
      + (contact.phone ? " · " + escapeHtml(contact.phone) : "")
      + (contact.email ? " · " + escapeHtml(contact.email) : "") + "</li>";
  }).join("");
  const preparation = (record.dossier?.sections || [])
    .filter(section => /снаряж|экипиров|подготов|документ|что взят|вещи/i.test(section.title))
    .map(section => "<h4>" + escapeHtml(section.title) + "</h4><p>" + escapeHtml(section.text) + "</p>").join("");
  const access = record.dossier?.accessNotice;
  const accessSources = access?.sources.map(id => {
    const source = sources[id];
    return '<li><a href="' + escapeHtml(source.url) + '">' + escapeHtml(source.title) + "</a></li>";
  }).join("");
  return '<article><h3><a href="' + escapeHtml(cardUrl(record.id)) + '">' + escapeHtml(record.title)
    + "</a></h3><p>" + escapeHtml(durationLabel(record.days))
    + (record.distance ? " · " + escapeHtml(record.distance) + " км" : "") + (visited ? " · Посещено" : "") + "</p>"
    + (access ? "<h4>" + escapeHtml(access.title) + "</h4><p>" + escapeHtml(access.text)
      + "</p><ul>" + accessSources + "</ul>" : "")
    + "<p>" + escapeHtml(record.plan) + "</p><p>" + escapeHtml(record.conditions) + "</p>"
    + (points ? "<h4>Точки и координаты</h4><ul>" + points + "</ul>" : "")
    + (contacts ? "<h4>Контакты</h4><ul>" + contacts + "</ul>" : "")
    + preparation + "<p>Сверено " + escapeHtml(record.checked) + "</p></article>";
}

function downloadTrip(trip, records, sources) {
  const name = escapeHtml(trip.name.trim() || "Поездка");
  const overview = renderStop(records.get(trip.sourceId), sources);
  const sections = trip.days.map((day, index) => {
    const date = dateForDay(trip.startDate, index);
    const items = day.entries.map(({ recordId, visited }) => renderStop(records.get(recordId), sources, visited)).join("");
    return "<section><h2>День " + (index + 1) + (date ? " · " + escapeHtml(date) : "")
      + "</h2>" + (day.note ? '<p class="note">' + escapeHtml(day.note) + "</p>" : "") + items + "</section>";
  }).join("");
  const html = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + "<title>" + name + "</title><style>"
    + "html{background:#f7f6ef;color:#192d24;font:16px/1.55 system-ui}body{max-width:760px;margin:2rem auto;padding:0 1.1rem}"
    + "h1,h2,h3{color:#13392c}section{border-top:1px solid #d0d7ca;margin-top:1.5rem}article{margin:1.5rem 0;break-inside:avoid}"
    + ".note{white-space:pre-wrap}a{color:#245544;overflow-wrap:anywhere}ul{padding-left:1.3rem}"
    + "</style><body><main><h1>" + name + "</h1>"
    + (overview ? "<section><h2>Маршрут и условия</h2>" + overview + "</section>" : "")
    + sections + "</main></body></html>";
  downloadFile("costa-rica-trip.html", "text/html;charset=utf-8", html);
}

export default function TripPlanner({ atlas, plans, create, select, edit, remove, storageError, linkTo }) {
  const records = useMemo(() => new Map(atlas.records.map(record => [record.id, record])), [atlas.records]);
  const trip = plans.trips.find(item => item.id === plans.activeId);
  const savedMessage = storageError
    ? "Браузер не сохранил изменения. Скачайте план, прежде чем закрыть страницу."
    : "Планы и заметки хранятся в этом браузере. Скачанный файл открывается без сети.";
  if (!trip) return <section className="trip-planner">
    <h1>Мои поездки</h1>
    <p>Соберите свой маршрут по дням или возьмите готовую экспедицию за основу.</p>
    <div className="trip-actions">
      <button type="button" className="button primary" onClick={() => create()}><Plus size={18} aria-hidden="true" /> Создать поездку</button>
      <a className="text-link" href="#expeditions">Выбрать экспедицию</a>
    </div>
  </section>;

  const navigation = trip.days.flatMap((day, index) => day.entries.map(entry => ({
    record: records.get(entry.recordId), prefix: `День ${index + 1}`,
  })));
  if (trip.sourceId) navigation.unshift({ record: records.get(trip.sourceId), prefix: "Основа поездки" });
  const routes = navigation.filter(({ record }) => record?.dossier?.stops.length).map(({ record, prefix }) => ({
    title: record.title, stops: record.dossier.stops, line: atlas.lines[record.dossier.line], prefix,
    accessNote: record.dossier.accessNotice?.title,
  }));

  const change = transform => edit(trip.id, transform);
  function updateDay(dayIndex, transform) {
    change(current => ({ ...current, days: current.days.map((day, index) => index === dayIndex ? transform(day) : day) }));
  }
  function moveToDay(key, to) {
    change(current => {
      const from = current.days.findIndex(day => day.entries.some(stop => stop.key === key));
      if (from < 0 || from === to || !current.days[to]) return current;
      const entry = current.days[from].entries.find(stop => stop.key === key);
      return { ...current, days: current.days.map((day, index) => {
        if (index === from) return { ...day, entries: day.entries.filter(stop => stop.key !== key) };
        if (index === to) return { ...day, entries: [...day.entries, entry] };
        return day;
      }) };
    });
  }
  function moveWithinDay(dayIndex, key, offset) {
    updateDay(dayIndex, day => {
      const position = day.entries.findIndex(stop => stop.key === key);
      const target = position + offset;
      if (position < 0 || !day.entries[target]) return day;
      const entries = [...day.entries];
      [entries[position], entries[target]] = [entries[target], entries[position]];
      return { ...day, entries };
    });
  }

  return <section className="trip-planner">
    <h1>Мои поездки</h1>
    <p role={storageError ? "alert" : undefined}>{savedMessage}</p>
    <div className="trip-workspace">
      <div className="trip-switch">
        <label>Выбрать поездку
          <select value={trip.id} onChange={event => select(event.target.value)}>
            {plans.trips.map(item => <option key={item.id} value={item.id}>{item.name.trim() || "Поездка"}</option>)}
          </select>
        </label>
        <button type="button" className="button secondary" onClick={() => create()}><Plus size={17} aria-hidden="true" /> Новая поездка</button>
      </div>
      <div className="trip-fields">
        <label>Название поездки
          <input value={trip.name} onChange={event => {
            const name = event.target.value;
            change(current => ({ ...current, name }));
          }} />
        </label>
        <label>Дата начала
          <input type="date" value={trip.startDate} onChange={event => {
            const startDate = event.target.value;
            change(current => ({ ...current, startDate }));
          }} />
        </label>
      </div>
      <div className="trip-actions">
        <button type="button" className="button primary" onClick={() => downloadTrip(trip, records, atlas.sources)}>
          <Download size={18} aria-hidden="true" /> Скачать план
        </button>
        {routes.length > 0 && <button type="button" className="button secondary"
          onClick={() => downloadGpx("costa-rica-trip.gpx", trip.name.trim() || "Поездка", routes, atlas)}>
          <Download size={18} aria-hidden="true" /> Скачать GPX поездки
        </button>}
        <a href="#catalog" className="text-link">Найти остановки</a>
        {trip.sourceId && <a href={linkTo(trip.sourceId)} className="text-link">Карта и условия экспедиции</a>}
        <button type="button" className="quiet-button trip-remove" onClick={() => {
          if (window.confirm("Удалить этот план поездки?")) remove(trip.id);
        }}>Удалить поездку</button>
      </div>
    </div>

    <div className="trip-days">
      {trip.days.map((day, dayIndex) => {
        const date = dateForDay(trip.startDate, dayIndex);
        return <section key={dayIndex} className="trip-day">
          <h2><CalendarDays size={23} aria-hidden="true" /> День {dayIndex + 1}{date && <span>{date}</span>}</h2>
          <label className="trip-notes">Заметка на день
            <textarea rows={day.note.includes("\n") ? 4 : 2} value={day.note} onChange={event => {
              const note = event.target.value;
              updateDay(dayIndex, current => ({ ...current, note }));
            }} />
          </label>
          {day.entries.length ? <ol className="trip-entries">{day.entries.map((item, position) => {
            const record = records.get(item.recordId);
            const title = record?.title || "Карточка недоступна";
            const pin = record?.dossier?.stops[0];
            return <li key={item.key} className="trip-entry">
              <div className="trip-stop">
                {record ? <a href={linkTo(record.id)}>{title}</a> : <span>{title}</span>}
                {pin && <small><MapPin size={14} aria-hidden="true" /> {pin.name}</small>}
                <AccessNotice notice={record?.dossier?.accessNotice} />
              </div>
              <div className="trip-entry-actions">
                <label className="trip-visited">
                  <input type="checkbox" checked={Boolean(item.visited)} onChange={event => {
                    const visited = event.target.checked;
                    updateDay(dayIndex, current => ({
                      ...current, entries: current.entries.map(stop => stop.key === item.key ? { ...stop, visited } : stop),
                    }));
                  }} />
                  Посещено
                </label>
                {trip.days.length > 1 && <select aria-label={'День для ' + title} value={dayIndex}
                  onChange={event => moveToDay(item.key, Number(event.target.value))}>
                  {trip.days.map((_, index) => <option key={index} value={index}>День {index + 1}</option>)}
                </select>}
                <button type="button" className="trip-icon" disabled={position === 0} aria-label={'Выше в плане · ' + title}
                  onClick={() => moveWithinDay(dayIndex, item.key, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" className="trip-icon" disabled={position === day.entries.length - 1} aria-label={'Ниже в плане · ' + title}
                  onClick={() => moveWithinDay(dayIndex, item.key, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
                <button type="button" className="trip-icon" aria-label={'Убрать из поездки · ' + title}
                  onClick={() => updateDay(dayIndex, current => ({
                    ...current, entries: current.entries.filter(stop => stop.key !== item.key),
                  }))}><X size={18} aria-hidden="true" /></button>
              </div>
            </li>;
          })}</ol> : <a href="#catalog" className="trip-day-empty">Подобрать остановку</a>}
        </section>;
      })}
    </div>
    <button type="button" className="button secondary" onClick={() => change(appendTripDay)}><Plus size={18} aria-hidden="true" /> Добавить день</button>
  </section>;
}
