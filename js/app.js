/*
 * Platzverwaltung – Ansichten, Navigation und Bedienlogik.
 */
(function () {
  'use strict';

  const S = window.Store;
  const CFG = window.APP_CONFIG;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- Helfer ---------- */

  const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (v, digits = 0) => (v === null || v === undefined || v === '' || isNaN(v)) ? '–'
    : Number(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: 2 });
  const fmtDate = (d) => (d ? d.split('-').reverse().join('.') : '–');
  const today = () => new Date().toISOString().slice(0, 10);
  const unit = (type) => CFG.units[type] || '';
  const parseNum = (str) => {
    if (str === null || str === undefined) return NaN;
    const s = String(str).trim().replace(/\s/g, '');
    if (!s) return NaN;
    // "12.345,6" oder "12345,6" oder "12345.6"
    const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    return Number(norm);
  };

  const ICON = {
    strom: '<svg viewBox="0 0 24 24" class="icon-strom"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    gas: '<svg viewBox="0 0 24 24" class="icon-gas"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-8z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    area: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM4 9h16M9 4v16"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M12 20V9m-5 5 5-5 5 5M5 4h14"/></svg>',
    pen: '<svg viewBox="0 0 24 24"><path d="M3 21l3-1 12-12-2-2L4 18zM14 6l2-2 4 4-2 2"/></svg>',
  };

  const statusOf = (p) => S.STATUS[p.status] || S.STATUS.leer;
  const nrBadge = (p, size = '') => `<span class="nr ${size}" style="background:${statusOf(p).color}">${h(p.nr)}</span>`;
  const statusBadge = (p) => `<span class="badge"><span class="dot" style="background:${statusOf(p).color}"></span>${h(statusOf(p).label)}</span>`;
  const tenantName = (p) => p.tenant.name || (S.isFree(p) ? 'frei' : 'Mieter nicht eingetragen');
  const serviceBadge = () => '<span class="nr nr-sm nr-service" title="Betriebszähler">B</span>';
  const objectOf = (p) => S.OBJECT_TYPES[p.objectType] || S.OBJECT_TYPES.pacht;
  const yesNo = (v) => v ? '<span class="yes">✓ ja</span>' : '<span class="no">✗ nein</span>';
  const fmtEuro = (v) => (v === '' || v === null || v === undefined || isNaN(v)) ? '–'
    : Number(v).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const hasShape = (p) => p.geometry && p.geometry.length >= 3;

  function gasText(p) {
    if (p.gas === 'tank') {
      const t = S.tank(p.gasTankId);
      return t ? `Gastank ${h(t.nr)}` : 'Gastank (nicht zugeordnet)';
    }
    return h(S.GAS[p.gas] || S.GAS.none);
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function csv(rows) {
    const cell = (v) => {
      const s = typeof v === 'number' ? v.toLocaleString('de-DE', { useGrouping: false, maximumFractionDigits: 2 }) : String(v ?? '');
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  }

  /* Formular-Dialog: fields = [{name,label,type,value,options,required,full}] */
  function formDialog({ title, fields, submitLabel = 'Speichern', onSubmit, extra = '' }) {
    const dlg = $('#dialog');
    dlg.innerHTML = `
      <form method="dialog" novalidate>
        <h2>${h(title)}</h2>
        ${fields.map(fieldHtml).join('')}
        ${extra}
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" data-cancel>Abbrechen</button>
          <button type="submit" class="btn">${h(submitLabel)}</button>
        </div>
      </form>`;
    const form = $('form', dlg);
    $('[data-cancel]', dlg).onclick = () => dlg.close();
    form.onsubmit = (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const missing = fields.find((f) => f.required && !String(values[f.name] || '').trim());
      if (missing) { toast(`Bitte „${missing.label}“ ausfüllen`); return; }
      if (onSubmit(values) !== false) dlg.close();
    };
    dlg.showModal();
    const first = $('input, select, textarea', form);
    if (first && window.matchMedia('(min-width: 861px)').matches) first.focus();
  }

  function fieldHtml(f) {
    const v = f.value ?? '';
    let input;
    if (f.type === 'select') {
      input = `<select name="${f.name}">${f.options.map(([val, label]) =>
        `<option value="${h(val)}"${String(val) === String(v) ? ' selected' : ''}>${h(label)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.name}" rows="3">${h(v)}</textarea>`;
    } else {
      const extra = f.type === 'number' ? ' inputmode="decimal" step="any"' : '';
      input = `<input type="${f.type || 'text'}" name="${f.name}" value="${h(v)}"${extra}${f.placeholder ? ` placeholder="${h(f.placeholder)}"` : ''}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}>`;
    }
    return `<label class="field${f.full ? ' full' : ''}"><span>${h(f.label)}${f.required ? ' *' : ''}</span>${input}</label>`;
  }

  const nextNr = (list) => String(list.reduce((m, x) => Math.max(m, parseInt(x.nr, 10) || 0), 0) + 1);

  /* ======================================================================
     KARTE
     ====================================================================== */

  const MapUI = {
    legendCollapsed: window.matchMedia('(max-width: 860px)').matches,

    init() {
      MapView.init($('#map'), {
        onSelect: (type, id) => { location.hash = `#/karte/${type}/${id}`; },
        onClear: () => { location.hash = '#/karte'; },
        onModeChange: () => this.renderModebar(),
      });

      $$('.segmented [data-color]').forEach((btn) => btn.addEventListener('click', () => {
        MapView.colorMode = btn.dataset.color;
        $$('.segmented [data-color]').forEach((b) => b.classList.toggle('is-active', b === btn));
        MapView.render();
        this.renderLegend();
      }));

      $('#btn-edit').addEventListener('click', () => this.setEdit(!MapView.editMode));
      this.initSearch();
      this.renderLegend();
      this.renderModebar();
    },

    setEdit(on) {
      if (!on) MapView.cancelMode();
      MapView.setEditMode(on);
      $('#btn-edit').setAttribute('aria-pressed', String(on));
      this.renderModebar();
    },

    renderLegend() {
      const el = $('#map-legend');
      const items = MapView.colorMode === 'supply'
        ? Object.values(S.SUPPLY).map((x) => [x.color, x.label])
        : Object.values(S.STATUS).map((x) => [x.color, x.label]);
      el.className = 'legend' + (this.legendCollapsed ? ' is-collapsed' : '');
      el.innerHTML = `
        <button type="button" class="legend-toggle" aria-expanded="${!this.legendCollapsed}">Legende ${this.legendCollapsed ? '▴' : '▾'}</button>
        <div class="legend-body">
          <h4>${MapView.colorMode === 'supply' ? 'Versorgung / Heizung' : 'Status der Parzelle'}</h4>
          <ul>${items.map(([c, l]) => `<li><span class="swatch" style="background:${c}"></span>${h(l)}</li>`).join('')}</ul>
          <div class="toggles">
            <label><input type="checkbox" data-layer="boxes" ${MapView.show.boxes ? 'checked' : ''}> ${ICON.strom} Stromkästen</label>
            <label><input type="checkbox" data-layer="tanks" ${MapView.show.tanks ? 'checked' : ''}> ${ICON.gas} Gastanks</label>
          </div>
          ${CFG.map.isPlaceholder ? '<div class="placeholder-note">Platzhalter-Karte – echter Lageplan folgt</div>' : ''}
        </div>`;
      $('.legend-toggle', el).onclick = () => { this.legendCollapsed = !this.legendCollapsed; this.renderLegend(); };
      $$('[data-layer]', el).forEach((cb) => cb.onchange = () => { MapView.show[cb.dataset.layer] = cb.checked; MapView.render(); });
    },

    renderModebar() {
      const bar = $('#map-modebar');
      const mode = MapView.mode;
      if (mode && mode.kind === 'draw') {
        const n = mode.points.length;
        bar.innerHTML = `
          <span class="grow">${h(mode.label || 'Umriss zeichnen')}: Ecken nacheinander antippen (${n} Punkt${n === 1 ? '' : 'e'})</span>
          <button type="button" class="btn btn-ghost btn-sm" data-act="undo" ${n ? '' : 'disabled'}>Rückgängig</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="cancel">Abbrechen</button>
          <button type="button" class="btn btn-sm" data-act="finish" ${n >= 3 ? '' : 'disabled'}>Umriss speichern</button>`;
      } else if (mode && mode.kind === 'place') {
        bar.innerHTML = `
          <span class="grow">${h(mode.label || 'Position wählen')}: auf die gewünschte Stelle in der Karte tippen</span>
          <button type="button" class="btn btn-ghost btn-sm" data-act="cancel">Abbrechen</button>`;
      } else if (MapView.editMode) {
        bar.innerHTML = `
          <span class="grow">Bearbeitungsmodus – Kästen und Tanks lassen sich verschieben</span>
          <button type="button" class="btn btn-ghost btn-sm" data-act="add-parcel">${ICON.plus} Parzelle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="add-box">${ICON.plus} Stromkasten</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="add-tank">${ICON.plus} Gastank</button>
          <button type="button" class="btn btn-sm btn-dark" data-act="done">Fertig</button>`;
      } else {
        bar.hidden = true;
        return;
      }
      bar.hidden = false;
      $$('[data-act]', bar).forEach((b) => b.onclick = () => this.modeAction(b.dataset.act));
      MapView.invalidate();
    },

    modeAction(act) {
      switch (act) {
        case 'undo': MapView.undoPoint(); break;
        case 'cancel': MapView.cancelMode(); break;
        case 'finish': MapView.finishDraw(); break;
        case 'done': this.setEdit(false); break;
        case 'add-parcel': Actions.newParcelOnMap(); break;
        case 'add-box': Actions.newBox(true); break;
        case 'add-tank': Actions.newTank(true); break;
      }
    },

    initSearch() {
      const input = $('#map-search');
      const box = $('#map-search-results');
      const run = () => {
        const q = input.value.trim().toLowerCase();
        if (!q) { box.hidden = true; return; }
        const res = [];
        S.parcelsSorted().forEach((p) => {
          const meterNos = S.metersOf(p.id).map((m) => m.number.toLowerCase());
          if (String(p.nr).toLowerCase() === q || String(p.nr).toLowerCase().startsWith(q) ||
              p.tenant.name.toLowerCase().includes(q) || meterNos.some((n) => n.includes(q))) {
            res.push({ type: 'parcel', id: p.id, html: `${nrBadge(p, 'nr-sm')}<span><strong>Parzelle ${h(p.nr)}</strong><br><span class="muted small">${h(tenantName(p))}</span></span>` });
          }
        });
        S.boxesSorted().forEach((b) => {
          if (`kasten ${b.nr}`.includes(q) || `k${b.nr}` === q || b.location.toLowerCase().includes(q)) {
            res.push({ type: 'box', id: b.id, html: `<span class="pin pin-box" style="transform:none">${ICON.strom}<span>${h(b.nr)}</span></span><span><strong>Stromkasten ${h(b.nr)}</strong><br><span class="muted small">${h(b.location || '')}</span></span>` });
          }
        });
        S.tanksSorted().forEach((t) => {
          if (`tank ${t.nr}`.includes(q) || `gastank ${t.nr}`.includes(q) || `t${t.nr}` === q) {
            res.push({ type: 'tank', id: t.id, html: `<span class="pin pin-tank" style="transform:none">${ICON.gas}<span>T${h(t.nr)}</span></span><strong>Gastank ${h(t.nr)}</strong>` });
          }
        });
        box.innerHTML = res.length
          ? res.slice(0, 12).map((r) => `<button type="button" data-type="${r.type}" data-id="${r.id}">${r.html}</button>`).join('')
          : '<div class="muted small" style="padding:10px">Nichts gefunden</div>';
        box.hidden = false;
        $$('button', box).forEach((b) => b.onclick = () => {
          box.hidden = true;
          input.value = '';
          input.blur();
          location.hash = `#/karte/${b.dataset.type}/${b.dataset.id}`;
        });
      };
      input.addEventListener('input', run);
      input.addEventListener('focus', run);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const first = $('button', box); if (first) first.click(); }
        if (e.key === 'Escape') { box.hidden = true; input.blur(); }
      });
      document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.hidden = true; });
    },

    /* Infofenster */
    showPanel(type, id) {
      const panel = $('#map-panel');
      let html = '';
      if (type === 'parcel') html = this.parcelPanel(S.parcel(id));
      else if (type === 'box') html = this.boxPanel(S.box(id));
      else if (type === 'tank') html = this.tankPanel(S.tank(id));
      if (!html) { this.hidePanel(); return; }
      panel.innerHTML = '<div class="sheet-handle"></div>' + html;
      panel.hidden = false;
      $('.close', panel).onclick = () => { location.hash = '#/karte'; };
      $$('[data-goto]', panel).forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.goto; }));
      $$('[data-action]', panel).forEach((el) => el.addEventListener('click', () => Actions[el.dataset.action](el.dataset.id)));
      $('.panel-body', panel).scrollTop = 0;
    },

    hidePanel() { $('#map-panel').hidden = true; },

    parcelPanel(p) {
      if (!p) return '';
      const meters = S.metersOf(p.id);
      return `
        <div class="panel-head">
          ${nrBadge(p)}
          <div class="title"><h2>Parzelle ${h(p.nr)}</h2>${statusBadge(p)}</div>
          <button class="close" aria-label="Schließen">${ICON.close}</button>
        </div>
        <div class="panel-body">
          <dl class="facts">
            <dt>Mieter</dt><dd>${p.tenant.name ? h(p.tenant.name) : `<span class="muted">${h(tenantName(p))}</span>`}</dd>
            ${p.tenant.phone ? `<dt>Telefon</dt><dd><a href="tel:${h(p.tenant.phone.replace(/[^\d+]/g, ''))}">${h(p.tenant.phone)}</a></dd>` : ''}
            <dt>Objekt</dt><dd>${h(objectOf(p).label)}</dd>
            <dt>Größe</dt><dd>${p.size ? fmtNum(p.size) + ' m²' : '–'}</dd>
            <dt>Winterwasser</dt><dd>${yesNo(p.winterWater)}</dd>
            <dt>Heizung</dt><dd>${h(S.HEATING[p.heating] || '–')}</dd>
            <dt>Gas</dt><dd>${p.gas === 'tank' && S.tank(p.gasTankId)
              ? `<button class="link-btn" data-goto="#/karte/tank/${p.gasTankId}">${gasText(p)}</button>` : gasText(p)}</dd>
          </dl>
          <div class="section-title">Zähler</div>
          ${meters.length ? `<ul class="meter-list">${meters.map((m) => this.meterItem(m, 'parcel')).join('')}</ul>` : '<p class="muted small">Keine Zähler hinterlegt.</p>'}
          ${p.notes ? `<div class="section-title">Notizen</div><p class="small" style="margin:0;white-space:pre-line">${h(p.notes)}</p>` : ''}
          ${MapView.editMode ? `<div class="section-title">Karte</div><button class="btn btn-ghost btn-sm" data-action="drawParcel" data-id="${p.id}">${ICON.pen} Umriss neu zeichnen</button>` : ''}
        </div>
        <div class="panel-actions">
          <a class="btn" href="#/parzelle/${p.id}">Karteikarte öffnen</a>
          <a class="btn btn-ghost" href="#/parzelle/${p.id}/bearbeiten">${ICON.edit} Bearbeiten</a>
        </div>`;
    },

    meterItem(m, context) {
      const last = S.lastReading(m.id);
      const p = S.parcel(m.parcelId);
      const lastTxt = last ? `zuletzt ${fmtNum(last.value)} ${unit(m.type)} (${fmtDate(last.date)})` : 'noch kein Zählerstand';
      if (context === 'parcel') {
        const b = S.box(m.boxId);
        const where = m.type === 'strom'
          ? (m.inHouse ? 'im Haus' : b ? `<button class="link-btn" data-goto="#/karte/box/${b.id}">Kasten ${h(b.nr)}</button>` : '<span class="warn">kein Kasten</span>')
          : h(m.location || 'Ort nicht angegeben');
        return `<li class="meter-item">${ICON[m.type]}<div class="body">
          <div class="line1">${m.type === 'strom' ? 'Strom' : 'Gas'} · <span class="mono">${h(m.number || '—')}</span></div>
          <div class="line2">${where} · ${lastTxt}</div></div></li>`;
      }
      // im Kasten / Tank: Parzelle im Vordergrund
      if (!p) {
        return `<li class="meter-item">${serviceBadge()}
          <div class="body">
            <div class="line1">${h(S.purposeText(m))} <span class="badge">Betrieb</span></div>
            <div class="line2"><span class="mono">${h(m.number || '—')}</span>${context === 'service' ? ` · ${h(S.meterPlace(m) || 'ohne Kasten')}` : ''} · ${lastTxt}</div>
          </div></li>`;
      }
      return `<li class="meter-item is-link" data-goto="#/karte/parcel/${p.id}" tabindex="0">
        ${nrBadge(p, 'nr-sm')}
        <div class="body">
          <div class="line1">${h(tenantName(p))}</div>
          <div class="line2"><span class="mono">${h(m.number || '—')}</span> · ${lastTxt}</div>
        </div></li>`;
    },

    boxPanel(b) {
      if (!b) return '';
      const meters = S.metersInBox(b.id);
      return `
        <div class="panel-head">
          <span class="pin pin-box" style="transform:none;height:42px;font-size:16px;padding:0 12px 0 8px">${ICON.strom}<span>${h(b.nr)}</span></span>
          <div class="title"><h2>Stromkasten ${h(b.nr)}</h2><span class="muted small">${h(b.location || 'kein Standorthinweis')}</span></div>
          <button class="close" aria-label="Schließen">${ICON.close}</button>
        </div>
        <div class="panel-body">
          <div class="section-title">${meters.length} Stromzähler in diesem Kasten</div>
          ${meters.length ? `<ul class="meter-list">${meters.map((m) => this.meterItem(m, 'box')).join('')}</ul>` : '<p class="muted small">Diesem Kasten sind noch keine Zähler zugeordnet.</p>'}
        </div>
        <div class="panel-actions">
          <a class="btn" href="#/ablesung?typ=strom&gruppe=${b.id}">Zählerstände erfassen</a>
          <button class="btn btn-ghost" data-action="editBox" data-id="${b.id}">${ICON.edit} Bearbeiten</button>
        </div>`;
    },

    tankPanel(t) {
      if (!t) return '';
      const parcels = S.parcelsOnTank(t.id);
      const items = parcels.map((p) => {
        const gm = S.metersOf(p.id).filter((m) => m.type === 'gas');
        if (gm.length) return gm.map((m) => this.meterItem(m, 'tank')).join('');
        return `<li class="meter-item is-link" data-goto="#/karte/parcel/${p.id}" tabindex="0">${nrBadge(p, 'nr-sm')}<div class="body"><div class="line1">${h(tenantName(p))}</div><div class="line2 warn">kein Gaszähler hinterlegt</div></div></li>`;
      }).join('');
      return `
        <div class="panel-head">
          <span class="pin pin-tank" style="transform:none;height:42px;font-size:16px;padding:0 12px 0 8px">${ICON.gas}<span>T${h(t.nr)}</span></span>
          <div class="title"><h2>Gastank ${h(t.nr)}</h2><span class="muted small">${h(t.capacity || '')}</span></div>
          <button class="close" aria-label="Schließen">${ICON.close}</button>
        </div>
        <div class="panel-body">
          ${t.notes ? `<p class="notice" style="margin-top:0">${h(t.notes)}</p>` : ''}
          <div class="section-title">${parcels.length} angeschlossene Parzelle${parcels.length === 1 ? '' : 'n'}</div>
          ${parcels.length ? `<ul class="meter-list">${items}</ul>` : '<p class="muted small">Noch keine Parzellen angeschlossen.</p>'}
        </div>
        <div class="panel-actions">
          <a class="btn" href="#/ablesung?typ=gas&gruppe=${t.id}">Zählerstände erfassen</a>
          <button class="btn btn-ghost" data-action="editTank" data-id="${t.id}">${ICON.edit} Bearbeiten</button>
        </div>`;
    },
  };

  /* ======================================================================
     AKTIONEN (Dialoge, Karte bearbeiten)
     ====================================================================== */

  const Actions = {
    editBox(id, afterCreate) {
      // Bestehender Kasten → eigene Seite mit Zählerverwaltung
      if (id) { location.hash = `#/kasten/${id}`; return; }
      const b = null;
      formDialog({
        title: b ? `Stromkasten ${b.nr} bearbeiten` : 'Neuer Stromkasten',
        fields: [
          { name: 'nr', label: 'Kasten-Nr.', value: b ? b.nr : nextNr(S.data.boxes), required: true },
          { name: 'location', label: 'Standort / Hinweis', value: b ? b.location : '', placeholder: 'z. B. am Hauptweg, hinter Parzelle 12' },
        ],
        extra: b ? `<button type="button" class="btn btn-danger btn-sm" data-del style="justify-self:start">${ICON.trash} Kasten löschen</button>` : '',
        onSubmit: (v) => {
          const nr = v.nr.trim();
          if (S.data.boxes.some((x) => x.nr === nr && x !== b)) { toast(`Kasten ${nr} gibt es schon`); return false; }
          if (b) { b.nr = nr; b.location = v.location.trim(); S.save(); toast('Gespeichert'); }
          else afterCreate({ id: S.uid('b'), nr, location: v.location.trim(), pos: null });
        },
      });
      const del = $('#dialog [data-del]');
      if (del) del.onclick = () => {
        const n = S.metersInBox(b.id).length;
        if (!confirm(`Stromkasten ${b.nr} wirklich löschen?${n ? `\n${n} Zähler verlieren damit ihre Kasten-Zuordnung.` : ''}`)) return;
        S.deleteBox(b.id); S.save(); $('#dialog').close(); toast('Kasten gelöscht');
        if (location.hash.startsWith('#/karte')) location.hash = '#/karte';
      };
    },

    editTank(id, afterCreate) {
      const t = id ? S.tank(id) : null;
      formDialog({
        title: t ? `Gastank ${t.nr} bearbeiten` : 'Neuer Gastank',
        fields: [
          { name: 'nr', label: 'Tank-Nr.', value: t ? t.nr : nextNr(S.data.tanks), required: true },
          { name: 'capacity', label: 'Größe / Füllmenge', value: t ? t.capacity : '', placeholder: 'z. B. 2.900 l' },
          { name: 'notes', label: 'Notizen', type: 'textarea', value: t ? t.notes : '' },
        ],
        extra: t ? `<button type="button" class="btn btn-danger btn-sm" data-del style="justify-self:start">${ICON.trash} Tank löschen</button>` : '',
        onSubmit: (v) => {
          const nr = v.nr.trim();
          if (S.data.tanks.some((x) => x.nr === nr && x !== t)) { toast(`Tank ${nr} gibt es schon`); return false; }
          if (t) { Object.assign(t, { nr, capacity: v.capacity.trim(), notes: v.notes.trim() }); S.save(); toast('Gespeichert'); }
          else afterCreate({ id: S.uid('t'), nr, capacity: v.capacity.trim(), notes: v.notes.trim(), pos: null });
        },
      });
      const del = $('#dialog [data-del]');
      if (del) del.onclick = () => {
        const n = S.parcelsOnTank(t.id).length;
        if (!confirm(`Gastank ${t.nr} wirklich löschen?${n ? `\n${n} Parzellen verlieren die Tank-Zuordnung.` : ''}`)) return;
        S.deleteTank(t.id); S.save(); $('#dialog').close(); toast('Tank gelöscht');
        if (location.hash.startsWith('#/karte')) location.hash = '#/karte';
      };
    },

    newBox(placeNow) {
      this.editBox(null, (b) => {
        S.data.boxes.push(b);
        S.save();
        if (placeNow) this.placeBox(b.id);
        else { toast(`Kasten ${b.nr} angelegt – jetzt Zähler hinzufügen`); location.hash = `#/kasten/${b.id}`; }
      });
    },
    newTank(placeNow) {
      this.editTank(null, (t) => {
        S.data.tanks.push(t);
        S.save();
        if (placeNow) this.placeTank(t.id); else toast(`Tank ${t.nr} angelegt`);
      });
    },

    _place(obj, label, type) {
      if (!location.hash.startsWith('#/karte')) location.hash = '#/karte';
      setTimeout(() => {
        MapView.startPlace((pt) => {
          obj.pos = pt; S.save();
          go(`#/karte/${type}/${obj.id}`);
          toast(`${label} platziert`);
        });
        MapView.mode.label = `${label} platzieren`;
        MapUI.renderModebar();
      }, 50);
    },
    placeBox(id) { const b = S.box(id); if (b) this._place(b, `Stromkasten ${b.nr}`, 'box'); },
    placeTank(id) { const t = S.tank(id); if (t) this._place(t, `Gastank ${t.nr}`, 'tank'); },

    drawParcel(id) {
      const p = S.parcel(id);
      if (!p) return;
      if (!location.hash.startsWith('#/karte')) go(`#/karte/parcel/${id}`);
      setTimeout(() => {
        MapUI.hidePanel();
        MapView.startDraw((points) => {
          p.geometry = points;
          const area = S.polygonArea(points);
          if (area && !p.size) p.size = area;
          S.save();
          go(`#/karte/parcel/${p.id}`);
          toast(`Umriss von Parzelle ${p.nr} gespeichert`);
        }, () => { go(`#/karte/parcel/${p.id}`); });
        MapView.mode.label = `Parzelle ${p.nr}`;
        MapUI.renderModebar();
      }, 50);
    },

    newParcelOnMap() {
      formDialog({
        title: 'Neue Parzelle einzeichnen',
        fields: [
          { name: 'nr', label: 'Parzellen-Nr.', value: nextNr(S.data.parcels), required: true },
          { name: 'status', label: 'Status', type: 'select', value: 'leer', options: Object.entries(S.STATUS).map(([k, v]) => [k, v.label]) },
        ],
        submitLabel: 'Weiter: Umriss zeichnen',
        onSubmit: (v) => {
          const nr = v.nr.trim();
          if (S.data.parcels.some((x) => x.nr === nr)) { toast(`Parzelle ${nr} gibt es schon`); return false; }
          const p = newParcel(nr, v.status);
          setTimeout(() => {
            MapUI.hidePanel();
            MapView.startDraw((points) => {
              p.geometry = points;
              p.size = S.polygonArea(points) || '';
              S.data.parcels.push(p);
              S.save();
              go(`#/karte/parcel/${p.id}`);
              toast(`Parzelle ${p.nr} angelegt`);
            });
            MapView.mode.label = `Neue Parzelle ${nr}`;
            MapUI.renderModebar();
          }, 50);
        },
      });
    },
  };

  function newParcel(nr, status) {
    return {
      id: S.uid('p'), nr, status: status || 'leer',
      tenant: { name: '', phone: '', email: '', address: '' },
      size: '', gas: 'none', gasTankId: '', heating: 'keine', notes: '', geometry: [],
    };
  }

  /* ======================================================================
     KARTEI
     ====================================================================== */

  const Kartei = {
    q: '', status: 'alle', supply: 'alle', extra: 'alle',

    render(root) {
      root.innerHTML = `
        <div class="page">
          <div class="page-head">
            <h1>Kartei</h1>
            <a class="btn" href="#/neu">${ICON.plus} Parzelle</a>
          </div>
          <div class="filters">
            <div class="search">${ICON.search}<input type="search" id="k-q" placeholder="Nr., Name, Telefon, Zählernummer…" value="${h(this.q)}" aria-label="Kartei durchsuchen"></div>
            <select id="k-supply" aria-label="Versorgung filtern">
              <option value="alle">Alle Versorgungsarten</option>
              ${Object.entries(S.SUPPLY).map(([k, v]) => `<option value="${k}"${this.supply === k ? ' selected' : ''}>${h(v.label)}</option>`).join('')}
            </select>
            <select id="k-extra" aria-label="Weitere Filter">
              ${[['alle', 'Alle Objekte'], ['pacht', 'Nur Pachtgrundstücke'], ['miet', 'Nur Mietobjekte'], ['ww1', 'Mit Winterwasser'], ['ww0', 'Ohne Winterwasser']]
                .map(([k, l]) => `<option value="${k}"${this.extra === k ? ' selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="chips" id="k-status" role="group" aria-label="Status filtern">
            <button type="button" class="chip${this.status === 'alle' ? ' is-active' : ''}" data-s="alle">Alle</button>
            ${Object.entries(S.STATUS).map(([k, v]) => `<button type="button" class="chip${this.status === k ? ' is-active' : ''}" data-s="${k}"><span class="dot" style="background:${v.color}"></span>${h(v.short)}</button>`).join('')}
          </div>
          <div class="result-count" id="k-count"></div>
          <ul class="card-list" id="k-list"></ul>
        </div>`;
      $('#k-q', root).addEventListener('input', (e) => { this.q = e.target.value; this.renderList(); });
      $('#k-supply', root).addEventListener('change', (e) => { this.supply = e.target.value; this.renderList(); });
      $('#k-extra', root).addEventListener('change', (e) => { this.extra = e.target.value; this.renderList(); });
      $$('#k-status .chip', root).forEach((c) => c.addEventListener('click', () => {
        this.status = c.dataset.s;
        $$('#k-status .chip', root).forEach((x) => x.classList.toggle('is-active', x === c));
        this.renderList();
      }));
      this.renderList();
    },

    renderList() {
      const q = this.q.trim().toLowerCase();
      const list = S.parcelsSorted().filter((p) => {
        if (this.status !== 'alle' && p.status !== this.status) return false;
        if (this.supply !== 'alle' && S.supplyOf(p) !== this.supply) return false;
        if ((this.extra === 'pacht' || this.extra === 'miet') && p.objectType !== this.extra) return false;
        if (this.extra === 'ww1' && !p.winterWater) return false;
        if (this.extra === 'ww0' && p.winterWater) return false;
        if (!q) return true;
        const hay = [p.nr, p.tenant.name, p.tenant.phone, p.tenant.email, p.notes,
          ...S.metersOf(p.id).map((m) => m.number)].join(' ').toLowerCase();
        return hay.includes(q);
      });
      const counts = Object.keys(S.STATUS).map((k) => `${list.filter((p) => p.status === k).length} ${S.STATUS[k].short}`);
      $('#k-count').textContent = `${list.length} Parzelle${list.length === 1 ? '' : 'n'} · ${counts.join(' · ')}`;
      $('#k-list').innerHTML = list.length ? list.map((p) => {
        const meters = S.metersOf(p.id);
        const strom = meters.filter((m) => m.type === 'strom').map((m) => h(S.meterPlace(m) || 'ohne Kasten'));
        return `<li><a class="card-row" href="#/parzelle/${p.id}">
          ${nrBadge(p)}
          <div class="main">
            <div class="name${p.tenant.name ? '' : ' free'}">${h(tenantName(p))}</div>
            <div class="meta">
              ${strom.length ? `<span>${ICON.strom}${strom.join(', ')}</span>` : ''}
              ${p.gas !== 'none' ? `<span>${ICON.gas}${gasText(p)}</span>` : ''}
              ${p.winterWater ? '<span title="Winterwasser">❄ Winterwasser</span>' : ''}
              ${p.tenant.phone ? `<span>${ICON.phone}${h(p.tenant.phone)}</span>` : ''}
            </div>
          </div>
          <div class="side">${statusBadge(p)}<span class="muted small">${p.objectType === 'miet' ? 'Mietobjekt · ' : ''}${p.size ? fmtNum(p.size) + ' m²' : ''}</span></div>
        </a></li>`;
      }).join('') : '<li class="muted" style="padding:20px;text-align:center">Keine Parzellen gefunden.</li>';
    },
  };

  /* ======================================================================
     PARZELLE: Detail & Formular
     ====================================================================== */

  const Detail = {
    render(root, id) {
      const p = S.parcel(id);
      if (!p) { root.innerHTML = '<div class="page"><p>Parzelle nicht gefunden.</p><a href="#/kartei">Zur Kartei</a></div>'; return; }
      const meters = S.metersOf(p.id);
      const strom = meters.filter((m) => m.type === 'strom');
      const gas = meters.filter((m) => m.type === 'gas');
      const area = S.polygonArea(p.geometry);
      const tank = p.gas === 'tank' ? S.tank(p.gasTankId) : null;

      const meterBlock = (m) => {
        const last = S.lastReading(m.id);
        const b = S.box(m.boxId);
        return `<dl class="facts" style="margin-bottom:10px">
          <dt>Zähler-Nr.</dt><dd class="mono">${h(m.number || '—')}</dd>
          ${m.type === 'strom' ? `<dt>Zählerort</dt><dd>${m.inHouse ? 'im Haus des Mieters' : b ? `<a href="#/karte/box/${b.id}">Kasten ${h(b.nr)}</a>${b.location ? ` <span class="muted small">(${h(b.location)})</span>` : ''}` : '<span class="warn">nicht zugeordnet</span>'}</dd>`
            : `<dt>Ort</dt><dd>${h(m.location || '–')}</dd>`}
          <dt>Letzter Stand</dt><dd>${last ? `${fmtNum(last.value)} ${unit(m.type)} <span class="muted small">(${fmtDate(last.date)})</span>` : '–'}</dd>
        </dl>`;
      };

      // Ablesehistorie
      const hist = [];
      meters.forEach((m) => {
        const rs = S.readingsOf(m.id);
        rs.forEach((r, i) => hist.push({ m, r, diff: i > 0 ? r.value - rs[i - 1].value : null }));
      });
      hist.sort((a, b) => b.r.date.localeCompare(a.r.date) || a.m.type.localeCompare(b.m.type));

      root.innerHTML = `
        <div class="page">
          <a class="back" href="#/kartei">${ICON.back} Kartei</a>
          <div class="detail-head">
            ${nrBadge(p, 'nr-lg')}
            <div class="title"><h1>Parzelle ${h(p.nr)}</h1>${statusBadge(p)}</div>
            <div class="actions">
              ${hasShape(p) ? `<a class="btn btn-ghost" href="#/karte/parcel/${p.id}">${ICON.map} Auf Karte</a>` : ''}
              <a class="btn" href="#/parzelle/${p.id}/bearbeiten">${ICON.edit} Bearbeiten</a>
            </div>
          </div>
          ${hasShape(p) ? '' : `<p class="notice">Diese Parzelle ist noch nicht auf der Karte eingezeichnet. <button class="link-btn" data-draw>Jetzt einzeichnen</button></p>`}
          <div class="cards">
            <section class="card">
              <h2>${ICON.user} Mieter</h2>
              <dl class="facts">
                <dt>Name</dt><dd>${p.tenant.name ? h(p.tenant.name) : '<span class="muted">–</span>'}</dd>
                <dt>Telefon</dt><dd>${p.tenant.phone ? `<a href="tel:${h(p.tenant.phone.replace(/[^\d+]/g, ''))}">${h(p.tenant.phone)}</a>` : '–'}</dd>
                <dt>E-Mail</dt><dd>${p.tenant.email ? `<a href="mailto:${h(p.tenant.email)}">${h(p.tenant.email)}</a>` : '–'}</dd>
                <dt>Anschrift</dt><dd style="white-space:pre-line">${h(p.tenant.address) || '–'}</dd>
              </dl>
            </section>
            <section class="card">
              <h2>${ICON.area} Grundstück</h2>
              <dl class="facts">
                <dt>Status</dt><dd>${h(statusOf(p).label)}</dd>
                <dt>Objektart</dt><dd>${h(objectOf(p).label)} <span class="muted small">(${h(objectOf(p).hint)})</span></dd>
                <dt>${h(objectOf(p).rentLabel)}</dt><dd>${fmtEuro(p.rent)}</dd>
                <dt>Winterwasser</dt><dd>${yesNo(p.winterWater)}</dd>
                <dt>Größe</dt><dd>${p.size ? fmtNum(p.size) + ' m²' : '–'}${area && CFG.map.isPlaceholder === false ? ` <span class="muted small">(Karte: ≈ ${fmtNum(area)} m²)</span>` : ''}</dd>
                <dt>Karte</dt><dd>${hasShape(p) ? `eingezeichnet · <button class="link-btn" data-draw>neu zeichnen</button>` : '<span class="warn">nicht eingezeichnet</span>'}</dd>
              </dl>
            </section>
            <section class="card">
              <h2>${ICON.strom} Strom</h2>
              ${strom.length ? strom.map(meterBlock).join('') : '<p class="muted">Kein Stromzähler hinterlegt.</p>'}
            </section>
            <section class="card">
              <h2>${ICON.gas} Gas &amp; Heizung</h2>
              <dl class="facts" style="margin-bottom:10px">
                <dt>Heizung</dt><dd>${h(S.HEATING[p.heating] || '–')}</dd>
                <dt>Gas</dt><dd>${tank ? `<a href="#/karte/tank/${tank.id}">Gastank ${h(tank.nr)}</a>` : gasText(p)}</dd>
                ${tank ? `<dt>Am Tank</dt><dd>${S.parcelsOnTank(tank.id).map((x) => x.id === p.id ? `<strong>${h(x.nr)}</strong>` : `<a href="#/parzelle/${x.id}">${h(x.nr)}</a>`).join(', ')}</dd>` : ''}
              </dl>
              ${gas.map(meterBlock).join('')}
              ${p.gas === 'tank' && !gas.length ? '<p class="warn small">Gastank-Anschluss, aber kein Gaszähler hinterlegt.</p>' : ''}
            </section>
            ${p.notes ? `<section class="card span-all"><h2>Notizen</h2><p style="margin:0;white-space:pre-line">${h(p.notes)}</p></section>` : ''}
            <section class="card span-all">
              <h2>Zählerstände</h2>
              ${hist.length ? `<div class="table-wrap"><table class="table-cards">
                <thead><tr><th>Datum</th><th>Zähler</th><th class="num">Stand</th><th class="num">Verbrauch</th></tr></thead>
                <tbody>${hist.map(({ m, r, diff }) => `<tr>
                  <td data-label="Datum">${fmtDate(r.date)}</td>
                  <td data-label="Zähler">${m.type === 'strom' ? 'Strom' : 'Gas'} <span class="mono muted">${h(m.number)}</span></td>
                  <td data-label="Stand" class="num">${fmtNum(r.value)} ${unit(m.type)}</td>
                  <td data-label="Verbrauch" class="num">${diff === null ? '–' : `${fmtNum(diff)} ${unit(m.type)}`}</td></tr>`).join('')}
                </tbody></table></div>` : '<p class="muted">Noch keine Zählerstände erfasst.</p>'}
            </section>
          </div>
        </div>`;
      $$('[data-draw]', root).forEach((b) => b.onclick = () => Actions.drawParcel(p.id));
    },
  };

  // Wem gehört ein Zähler? ("Parzelle 12 (Name)" oder "Sanitäranlagen – WC")
  function meterOwner(m) {
    const p = S.parcel(m.parcelId);
    if (p) return `Parzelle ${p.nr}${p.tenant.name ? ` (${p.tenant.name})` : ''}`;
    return `Betrieb: ${S.purposeText(m)}`;
  }

  // Doppelte Zählernummern in einer Arbeitsliste finden → Map(index → Meldung)
  function meterDuplicates(list, removedIds = []) {
    const out = new Map();
    const exclude = [...list.filter((m) => m.id).map((m) => m.id), ...removedIds];
    const norm = (n) => String(n || '').replace(/\s/g, '').toLowerCase();
    list.forEach((m, i) => {
      const n = norm(m.number);
      if (!n) return;
      const other = S.findMeterByNumber(m.number, exclude);
      if (other) { out.set(i, `Diese Zählernummer ist schon vergeben: ${meterOwner(other)}`); return; }
      if (list.some((x, k) => k !== i && norm(x.number) === n)) out.set(i, 'Diese Zählernummer steht hier doppelt.');
    });
    return out;
  }

  // Warnhinweise unter den Zählernummer-Feldern aktualisieren (ohne Neuaufbau → Fokus bleibt)
  function showMeterWarnings(root, list, removedIds) {
    const dups = meterDuplicates(list, removedIds);
    $$('[data-i]', root).forEach((row) => {
      const el = $('.dup-warn', row);
      if (!el) return;
      const msg = dups.get(+row.dataset.i);
      el.textContent = msg || '';
      el.hidden = !msg;
      row.classList.toggle('has-warn', !!msg);
    });
    return dups;
  }

  function confirmMeterDuplicates(list, removedIds) {
    const dups = meterDuplicates(list, removedIds);
    if (!dups.size) return true;
    const lines = [...dups.entries()].map(([i, msg]) => `• ${list[i].number}: ${msg}`).join('\n');
    return confirm(`Achtung, doppelte Zählernummer:\n${lines}\n\nTrotzdem speichern?`);
  }

  const Edit = {
    render(root, id) {
      const isNew = !id;
      const p = isNew ? newParcel(nextNr(S.data.parcels), 'leer') : S.parcel(id);
      if (!p) { root.innerHTML = '<div class="page"><p>Parzelle nicht gefunden.</p></div>'; return; }
      const blankMeter = (type) => ({ id: null, type, number: '', boxId: '', inHouse: false, purpose: '', label: '', location: '' });
      // Arbeitskopie der Zähler
      const meters = isNew ? [blankMeter('strom')] : S.metersOf(p.id).map((m) => ({ ...m }));
      const removed = [];

      const boxOpts = [['', '– bitte wählen –'], ['__haus', 'Im Haus des Mieters (kein Kasten)'],
        ...S.boxesSorted().map((b) => [b.id, `Kasten ${b.nr}${b.location ? ' – ' + b.location : ''}`])];
      const tankOpts = [['', '– Tank wählen –'], ...S.tanksSorted().map((t) => [t.id, `Gastank ${t.nr}`])];
      const backHref = isNew ? '#/kartei' : `#/parzelle/${p.id}`;

      root.innerHTML = `
        <div class="page">
          <a class="back" href="${backHref}">${ICON.back} ${isNew ? 'Kartei' : 'Zurück'}</a>
          <div class="page-head"><h1>${isNew ? 'Neue Parzelle' : `Parzelle ${h(p.nr)} bearbeiten`}</h1></div>
          <form id="edit-form" novalidate>
            <div class="cards">
              <section class="card">
                <h2>Grundstück</h2>
                <div class="form-grid">
                  <div>${fieldHtml({ name: 'nr', label: 'Parzellen-Nr.', value: p.nr, required: true })}<p class="dup-warn" id="nr-warn" hidden></p></div>
                  ${fieldHtml({ name: 'size', label: 'Größe (m²)', type: 'number', value: p.size })}
                  ${fieldHtml({ name: 'status', label: 'Status', type: 'select', value: p.status, options: Object.entries(S.STATUS).map(([k, v]) => [k, v.label]), full: true })}
                  ${fieldHtml({ name: 'objectType', label: 'Objektart', type: 'select', value: p.objectType, options: Object.entries(S.OBJECT_TYPES).map(([k, v]) => [k, `${v.label} (${v.hint})`]), full: true })}
                  <label class="field"><span id="rent-label">${h(objectOf(p).rentLabel)} (€)</span><input type="number" name="rent" inputmode="decimal" step="any" value="${h(p.rent)}"></label>
                  <label class="check"><input type="checkbox" name="winterWater" ${p.winterWater ? 'checked' : ''}> Winterwasser</label>
                </div>
              </section>
              <section class="card">
                <h2>Mieter</h2>
                <div class="form-grid">
                  ${fieldHtml({ name: 'name', label: 'Name', value: p.tenant.name, full: true, autocomplete: 'off' })}
                  ${fieldHtml({ name: 'phone', label: 'Telefon', type: 'tel', value: p.tenant.phone, autocomplete: 'off' })}
                  ${fieldHtml({ name: 'email', label: 'E-Mail', type: 'email', value: p.tenant.email, autocomplete: 'off' })}
                  ${fieldHtml({ name: 'address', label: 'Anschrift (falls abweichend)', type: 'textarea', value: p.tenant.address, full: true })}
                </div>
              </section>
              <section class="card">
                <h2>${ICON.strom} Stromzähler</h2>
                <div id="strom-list"></div>
                <button type="button" class="btn btn-ghost btn-sm" data-add="strom">${ICON.plus} Stromzähler</button>
              </section>
              <section class="card">
                <h2>${ICON.gas} Gas &amp; Heizung</h2>
                <div class="form-grid">
                  ${fieldHtml({ name: 'heating', label: 'Heizung', type: 'select', value: p.heating, options: Object.entries(S.HEATING) })}
                  ${fieldHtml({ name: 'gas', label: 'Gasversorgung', type: 'select', value: p.gas, options: Object.entries(S.GAS) })}
                  <div class="full" id="tank-field">${fieldHtml({ name: 'gasTankId', label: 'Angeschlossen an', type: 'select', value: p.gasTankId, options: tankOpts })}</div>
                </div>
                <div id="gas-meters" style="margin-top:12px">
                  <div class="section-title" style="margin-top:0">Gaszähler</div>
                  <div id="gas-list"></div>
                  <button type="button" class="btn btn-ghost btn-sm" data-add="gas">${ICON.plus} Gaszähler</button>
                </div>
              </section>
              <section class="card span-all">
                <h2>Notizen</h2>
                ${fieldHtml({ name: 'notes', label: 'Interne Notizen', type: 'textarea', value: p.notes })}
              </section>
            </div>
            <div class="form-footer">
              ${isNew ? '' : `<button type="button" class="btn btn-danger" data-delete style="margin-right:auto" aria-label="Parzelle löschen">${ICON.trash}<span class="btn-text">Löschen</span></button>`}
              <a class="btn btn-ghost" href="${backHref}">Abbrechen</a>
              <button type="submit" class="btn">Speichern</button>
            </div>
          </form>
        </div>`;

      const form = $('#edit-form', root);
      const f = form.elements;

      // Parzellen-Nr. sofort prüfen
      const checkNr = () => {
        const other = S.findParcelByNr(f.nr.value, p.id);
        const warn = $('#nr-warn', root);
        warn.textContent = other ? `Parzelle ${other.nr} gibt es schon${other.tenant.name ? ` (${other.tenant.name})` : ''}.` : '';
        warn.hidden = !other;
        return other;
      };
      f.nr.addEventListener('input', checkNr);
      f.objectType.addEventListener('change', () => {
        $('#rent-label', root).textContent = `${S.OBJECT_TYPES[f.objectType.value].rentLabel} (€)`;
      });

      const renderMeters = () => {
        ['strom', 'gas'].forEach((type) => {
          const list = meters.map((m, i) => ({ m, i })).filter(({ m }) => m.type === type);
          $(`#${type}-list`, root).innerHTML = list.length ? list.map(({ m, i }) => {
            const place = m.inHouse ? '__haus' : m.boxId;
            return `
            <div class="meter-edit" data-i="${i}">
              <label class="field"><span>Zähler-Nr.</span><input type="text" data-k="number" value="${h(m.number)}" autocomplete="off"></label>
              ${type === 'strom'
                ? `<label class="field"><span>Wo hängt der Zähler?</span><select data-k="place">${boxOpts.map(([v, l]) => `<option value="${h(v)}"${v === place ? ' selected' : ''}>${h(l)}</option>`).join('')}</select></label>`
                : `<label class="field"><span>Ort am Grundstück</span><input type="text" data-k="location" value="${h(m.location)}" placeholder="z. B. Hauswand"></label>`}
              <button type="button" class="close meter-remove" data-remove="${i}" aria-label="Zähler entfernen" title="Zähler entfernen">${ICON.trash}</button>
              <p class="dup-warn" hidden></p>
            </div>`;
          }).join('') : `<p class="muted small">Kein ${type === 'strom' ? 'Strom' : 'Gas'}zähler.</p>`;
        });
        $$('.meter-edit [data-k]', root).forEach((inp) => inp.addEventListener('input', () => {
          const m = meters[+inp.closest('.meter-edit').dataset.i];
          if (inp.dataset.k === 'place') {
            m.inHouse = inp.value === '__haus';
            m.boxId = m.inHouse ? '' : inp.value;
          } else {
            m[inp.dataset.k] = inp.value;
          }
          if (inp.dataset.k === 'number') showMeterWarnings(root, meters, removed);
        }));
        $$('[data-remove]', root).forEach((b) => b.onclick = () => {
          const m = meters[+b.dataset.remove];
          if (m.id && S.readingsOf(m.id).length && !confirm('Für diesen Zähler gibt es bereits Ablesungen. Zähler samt Ablesungen entfernen?')) return;
          if (m.id) removed.push(m.id);
          meters.splice(+b.dataset.remove, 1);
          renderMeters();
        });
        showMeterWarnings(root, meters, removed);
      };
      renderMeters();

      $$('[data-add]', root).forEach((b) => b.onclick = () => {
        meters.push(blankMeter(b.dataset.add));
        renderMeters();
        const inputs = $$(`#${b.dataset.add}-list input[data-k=number]`, root);
        if (inputs.length) inputs[inputs.length - 1].focus();
      });

      const syncGas = () => {
        const g = f.gas.value;
        $('#tank-field', root).hidden = g !== 'tank';
        $('#gas-meters', root).hidden = g !== 'tank' && !meters.some((m) => m.type === 'gas');
      };
      f.gas.addEventListener('change', () => {
        if (f.gas.value === 'tank' && !meters.some((m) => m.type === 'gas')) {
          meters.push(blankMeter('gas'));
          renderMeters();
        }
        syncGas();
      });
      syncGas();

      const del = $('[data-delete]', root);
      if (del) del.onclick = () => {
        if (!confirm(`Parzelle ${p.nr} mit allen Zählern und Ablesungen endgültig löschen?`)) return;
        S.deleteParcel(p.id); S.save(); toast(`Parzelle ${p.nr} gelöscht`);
        location.hash = '#/kartei';
      };

      form.onsubmit = (e) => {
        e.preventDefault();
        const nr = f.nr.value.trim();
        if (!nr) { toast('Bitte eine Parzellen-Nr. angeben'); f.nr.focus(); return; }
        const other = checkNr();
        if (other) {
          alert(`Die Parzellen-Nr. ${nr} ist bereits vergeben${other.tenant.name ? ` (${other.tenant.name})` : ''}.\nBitte eine andere Nummer wählen.`);
          f.nr.focus();
          return;
        }
        if (!confirmMeterDuplicates(meters, removed)) return;
        const size = parseNum(f.size.value);
        const rent = parseNum(f.rent.value);
        Object.assign(p, {
          nr,
          size: isNaN(size) ? '' : size,
          status: f.status.value,
          objectType: f.objectType.value,
          rent: isNaN(rent) ? '' : rent,
          winterWater: f.winterWater.checked,
          heating: f.heating.value,
          gas: f.gas.value,
          gasTankId: f.gas.value === 'tank' ? f.gasTankId.value : '',
          notes: f.notes.value.trim(),
          tenant: { name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), address: f.address.value.trim() },
        });
        if (isNew) S.data.parcels.push(p);

        removed.forEach((mid) => S.deleteMeter(mid));
        meters.forEach((m) => {
          const strom = m.type === 'strom';
          const clean = {
            type: m.type, number: m.number.trim(),
            boxId: strom && !m.inHouse ? m.boxId : '', inHouse: strom && !!m.inHouse,
            location: strom ? '' : (m.location || '').trim(), purpose: '', label: '', parcelId: p.id,
          };
          if (m.id) Object.assign(S.meter(m.id), clean);
          else if (clean.number || clean.boxId || clean.inHouse) S.data.meters.push({ id: S.uid('m'), notes: '', ...clean });
        });
        S.save();
        toast('Gespeichert');
        location.hash = `#/parzelle/${p.id}`;
      };
    },
  };

  /* ======================================================================
     STROMKASTEN BEARBEITEN (inkl. Zähler & Betriebszähler)
     ====================================================================== */

  const BoxEdit = {
    render(root, id) {
      const b = S.box(id);
      if (!b) { root.innerHTML = '<div class="page"><p>Stromkasten nicht gefunden.</p><a href="#/technik">Zur Technik</a></div>'; return; }
      const meters = S.metersInBox(b.id).filter((m) => m.type === 'strom').map((m) => ({ ...m }));
      const removed = [];
      const parcelOpts = S.parcelsSorted().map((p) => [`p:${p.id}`, `Parzelle ${p.nr}${p.tenant.name ? ' – ' + p.tenant.name : ''}`]);
      const purposeOpts = Object.entries(S.PURPOSES).map(([k, v]) => [`s:${k}`, v]);
      const assignOf = (m) => (m.parcelId ? `p:${m.parcelId}` : m.purpose ? `s:${m.purpose}` : '');

      root.innerHTML = `
        <div class="page">
          <a class="back" href="#/technik">${ICON.back} Technik</a>
          <div class="page-head"><h1>Stromkasten ${h(b.nr)} bearbeiten</h1></div>
          <form id="box-form" novalidate>
            <div class="cards">
              <section class="card span-all">
                <h2>Kasten</h2>
                <div class="form-grid">
                  ${fieldHtml({ name: 'nr', label: 'Kasten-Nr.', value: b.nr, required: true })}
                  ${fieldHtml({ name: 'location', label: 'Standort / Hinweis', value: b.location, placeholder: 'z. B. am Hauptweg, hinter Parzelle 12' })}
                </div>
              </section>
              <section class="card span-all">
                <h2>${ICON.strom} Zähler in diesem Kasten</h2>
                <p class="small muted" style="margin-top:-6px">Jeden Zähler entweder einer Parzelle zuordnen oder als Betriebsstrom (z. B. Platzbeleuchtung, Sanitär) kennzeichnen.</p>
                <div id="box-meters"></div>
                <button type="button" class="btn btn-ghost btn-sm" id="box-add">${ICON.plus} Zähler hinzufügen</button>
              </section>
            </div>
            <div class="form-footer">
              <button type="button" class="btn btn-danger" id="box-delete" style="margin-right:auto" aria-label="Kasten löschen">${ICON.trash}<span class="btn-text">Kasten löschen</span></button>
              <a class="btn btn-ghost" href="#/technik">Abbrechen</a>
              <button type="submit" class="btn">Speichern</button>
            </div>
          </form>
        </div>`;

      const form = $('#box-form', root);
      const list = $('#box-meters', root);

      const renderRows = () => {
        list.innerHTML = meters.length ? meters.map((m, i) => {
          const a = assignOf(m);
          const isService = a.startsWith('s:');
          return `
          <div class="meter-edit meter-edit-box" data-i="${i}">
            <label class="field"><span>Zähler-Nr.</span><input type="text" data-k="number" value="${h(m.number)}" autocomplete="off"></label>
            <label class="field"><span>Zuordnung</span>
              <select data-k="assign">
                <option value=""${a ? '' : ' selected'}>– bitte wählen –</option>
                <optgroup label="Betriebsstrom">${purposeOpts.map(([v, l]) => `<option value="${v}"${v === a ? ' selected' : ''}>${h(l)}</option>`).join('')}</optgroup>
                <optgroup label="Parzelle">${parcelOpts.map(([v, l]) => `<option value="${v}"${v === a ? ' selected' : ''}>${h(l)}</option>`).join('')}</optgroup>
              </select></label>
            <label class="field"${isService ? '' : ' hidden'}><span>Bezeichnung (optional)</span><input type="text" data-k="label" value="${h(m.label)}" placeholder="z. B. Sanitärgebäude Nord"></label>
            <button type="button" class="close meter-remove" data-remove="${i}" aria-label="Zähler entfernen" title="Zähler entfernen">${ICON.trash}</button>
            <p class="dup-warn" hidden></p>
          </div>`;
        }).join('') : '<p class="muted small">Noch keine Zähler in diesem Kasten.</p>';

        $$('[data-k]', list).forEach((inp) => inp.addEventListener('input', () => {
          const m = meters[+inp.closest('[data-i]').dataset.i];
          if (inp.dataset.k === 'assign') {
            const [kind, val] = [inp.value.slice(0, 1), inp.value.slice(2)];
            m.parcelId = kind === 'p' ? val : '';
            m.purpose = kind === 's' ? val : '';
            renderRows();
            return;
          }
          m[inp.dataset.k] = inp.value;
          if (inp.dataset.k === 'number') showMeterWarnings(list, meters, removed);
        }));
        $$('[data-remove]', list).forEach((btn) => btn.onclick = () => {
          const m = meters[+btn.dataset.remove];
          if (m.id && S.readingsOf(m.id).length && !confirm('Für diesen Zähler gibt es bereits Ablesungen. Zähler samt Ablesungen entfernen?')) return;
          if (m.id) removed.push(m.id);
          meters.splice(+btn.dataset.remove, 1);
          renderRows();
        });
        showMeterWarnings(list, meters, removed);
      };
      renderRows();

      $('#box-add', root).onclick = () => {
        meters.push({ id: null, type: 'strom', number: '', parcelId: '', boxId: b.id, inHouse: false, purpose: '', label: '', location: '' });
        renderRows();
        const inputs = $$('input[data-k=number]', list);
        inputs[inputs.length - 1].focus();
      };

      $('#box-delete', root).onclick = () => {
        const n = S.metersInBox(b.id).length;
        if (!confirm(`Stromkasten ${b.nr} wirklich löschen?${n ? `\n${n} Zähler verlieren damit ihre Kasten-Zuordnung (die Zähler selbst bleiben erhalten).` : ''}`)) return;
        S.deleteBox(b.id); S.save(); toast('Kasten gelöscht');
        location.hash = '#/technik';
      };

      form.onsubmit = (e) => {
        e.preventDefault();
        const nr = form.elements.nr.value.trim();
        if (!nr) { toast('Bitte eine Kasten-Nr. angeben'); return; }
        if (S.data.boxes.some((x) => x.nr === nr && x.id !== b.id)) { alert(`Kasten ${nr} gibt es schon. Bitte eine andere Nummer wählen.`); return; }
        const missing = meters.findIndex((m) => (m.number.trim() || m.id) && !assignOf(m));
        if (missing >= 0) { alert('Bitte bei jedem Zähler eine Zuordnung wählen (Parzelle oder Betriebsstrom).'); return; }
        if (!confirmMeterDuplicates(meters, removed)) return;

        b.nr = nr;
        b.location = form.elements.location.value.trim();
        removed.forEach((mid) => S.deleteMeter(mid));
        meters.forEach((m) => {
          if (!m.id && !m.number.trim() && !assignOf(m)) return; // leere neue Zeile
          const clean = {
            type: 'strom', number: m.number.trim(), boxId: b.id, inHouse: false,
            parcelId: m.parcelId || '', purpose: m.parcelId ? '' : m.purpose, label: m.parcelId ? '' : (m.label || '').trim(),
          };
          if (m.id) Object.assign(S.meter(m.id), clean);
          else S.data.meters.push({ id: S.uid('m'), location: '', notes: '', ...clean });
        });
        S.save();
        toast(`Stromkasten ${nr} gespeichert`);
        location.hash = '#/technik';
      };
    },
  };

  /* ======================================================================
     TECHNIK (Stromkästen & Gastanks)
     ====================================================================== */

  const Technik = {
    render(root) {
      const boxes = S.boxesSorted();
      const tanks = S.tanksSorted();
      const unassigned = S.data.meters.filter((m) => m.type === 'strom' && !m.inHouse && !S.box(m.boxId));
      const inHouse = S.sortMeters(S.data.meters.filter((m) => m.type === 'strom' && m.inHouse));
      const service = S.serviceMeters();
      const chip = (p) => `<a href="#/parzelle/${p.id}" class="badge" style="text-decoration:none"><span class="dot" style="background:${statusOf(p).color}"></span>${h(p.nr)}</a>`;

      root.innerHTML = `
        <div class="page">
          <div class="page-head">
            <h1>Stromkästen</h1>
            <button class="btn" data-new="box">${ICON.plus} Stromkasten</button>
          </div>
          ${unassigned.length ? `<p class="notice">${unassigned.length} Stromzähler sind keinem Kasten zugeordnet: ${unassigned.map((m) => { const p = S.parcel(m.parcelId); return p ? chip(p) : h(S.purposeText(m)); }).join(' ')}</p>` : ''}
          <div class="cards">
            ${boxes.map((b) => {
              const ms = S.metersInBox(b.id);
              const svc = ms.filter((m) => S.isService(m));
              return `<section class="card">
                <h3><span class="pin pin-box" style="transform:none">${ICON.strom}<span>${h(b.nr)}</span></span> Stromkasten ${h(b.nr)}</h3>
                <p class="muted small" style="margin:-6px 0 10px">${h(b.location || 'kein Standorthinweis')}</p>
                <div class="small" style="margin-bottom:6px"><strong>${ms.length}</strong> Zähler${ms.length - svc.length ? ' für Parzellen:' : ''}</div>
                <div class="chips">${ms.map((m) => S.parcel(m.parcelId)).filter(Boolean).map(chip).join('') || (svc.length ? '' : '<span class="muted small">–</span>')}</div>
                ${svc.length ? `<div class="chips" style="margin-top:6px">${svc.map((m) => `<span class="badge badge-service">B · ${h(S.purposeText(m))}</span>`).join('')}</div>` : ''}
                <div class="card-actions">
                  ${b.pos ? `<a class="btn btn-ghost btn-sm" href="#/karte/box/${b.id}">${ICON.map} Karte</a>` : `<button class="btn btn-sm" data-place-box="${b.id}">${ICON.map} Auf Karte platzieren</button>`}
                  <button class="btn btn-ghost btn-sm" data-edit-box="${b.id}">${ICON.edit} Bearbeiten</button>
                  <a class="btn btn-ghost btn-sm" href="#/ablesung?typ=strom&gruppe=${b.id}">Ablesen</a>
                </div>
              </section>`;
            }).join('') || '<p class="muted">Noch keine Stromkästen angelegt.</p>'}
          </div>

          <div class="page-head" style="margin-top:32px">
            <h1>Gastanks</h1>
            <button class="btn" data-new="tank">${ICON.plus} Gastank</button>
          </div>
          <div class="cards">
            ${tanks.map((t) => {
              const ps = S.parcelsOnTank(t.id);
              return `<section class="card">
                <h3><span class="pin pin-tank" style="transform:none">${ICON.gas}<span>T${h(t.nr)}</span></span> Gastank ${h(t.nr)}</h3>
                <p class="muted small" style="margin:-6px 0 10px">${h([t.capacity, t.notes].filter(Boolean).join(' · ') || '–')}</p>
                <div class="small" style="margin-bottom:6px"><strong>${ps.length}</strong> angeschlossene Parzellen:</div>
                <div class="chips">${ps.map(chip).join('') || '<span class="muted small">–</span>'}</div>
                <div class="card-actions">
                  ${t.pos ? `<a class="btn btn-ghost btn-sm" href="#/karte/tank/${t.id}">${ICON.map} Karte</a>` : `<button class="btn btn-sm" data-place-tank="${t.id}">${ICON.map} Auf Karte platzieren</button>`}
                  <button class="btn btn-ghost btn-sm" data-edit-tank="${t.id}">${ICON.edit} Bearbeiten</button>
                  <a class="btn btn-ghost btn-sm" href="#/ablesung?typ=gas&gruppe=${t.id}">Ablesen</a>
                </div>
              </section>`;
            }).join('') || '<p class="muted">Noch keine Gastanks angelegt.</p>'}
          </div>

          <div class="cards" style="margin-top:32px">
            <section class="card">
              <h3>${ICON.strom} Betriebszähler</h3>
              <p class="small muted" style="margin:0 0 8px">Allgemeiner Betrieb (Beleuchtung, Sanitär, Camperstrom …). Hinzufügen über „Bearbeiten“ beim jeweiligen Stromkasten.</p>
              ${service.length ? `<ul class="meter-list">${service.map((m) => MapUI.meterItem(m, 'service')).join('')}</ul>` : '<p class="muted small">Noch keine Betriebszähler.</p>'}
            </section>
            <section class="card">
              <h3>${ICON.strom} Zähler im Haus</h3>
              <p class="small muted" style="margin:0 0 8px">Stromzähler, die beim Mieter im Haus hängen (kein Kasten):</p>
              <div class="chips">${inHouse.map((m) => S.parcel(m.parcelId)).filter(Boolean).map(chip).join('') || '<span class="muted small">–</span>'}</div>
            </section>
          </div>

          <div class="card" style="margin-top:14px">
            <h3>${ICON.gas} Gasflaschen</h3>
            <p class="small muted" style="margin:0 0 8px">Parzellen, die mit Gasflaschen versorgt werden (kein Zähler):</p>
            <div class="chips">${S.parcelsSorted().filter((p) => p.gas === 'bottle').map(chip).join('') || '<span class="muted small">–</span>'}</div>
          </div>
        </div>`;

      const rerender = () => this.render(root);
      $('[data-new=box]', root).onclick = () => Actions.newBox(false);
      $('[data-new=tank]', root).onclick = () => Actions.newTank(false);
      $$('[data-edit-box]', root).forEach((b) => b.onclick = () => Actions.editBox(b.dataset.editBox));
      $$('[data-edit-tank]', root).forEach((b) => b.onclick = () => Actions.editTank(b.dataset.editTank));
      $$('[data-place-box]', root).forEach((b) => b.onclick = () => Actions.placeBox(b.dataset.placeBox));
      $$('[data-place-tank]', root).forEach((b) => b.onclick = () => Actions.placeTank(b.dataset.placeTank));
      this._rerender = rerender;
    },
  };

  /* ======================================================================
     ZÄHLER: Ablesung & Verbrauch
     ====================================================================== */

  const Ablesung = {
    type: 'strom', date: today(), group: 'alle', onlyOpen: false,
    draft: {}, // meterId -> string (Eingabe)

    render(root, params) {
      if (params.get('typ')) this.type = params.get('typ') === 'gas' ? 'gas' : 'strom';
      if (params.get('gruppe')) this.group = params.get('gruppe');

      const groupOpts = this.type === 'strom'
        ? [['alle', 'Alle Kästen'], ...S.boxesSorted().map((b) => [b.id, `Kasten ${b.nr}`]), ['haus', 'Im Haus'], ['ohne', 'ohne Kasten']]
        : [['alle', 'Alle Gaszähler'], ...S.tanksSorted().map((t) => [t.id, `Gastank ${t.nr}`]), ['ohne', 'ohne Tank']];
      if (!groupOpts.some(([v]) => v === this.group)) this.group = 'alle';

      root.innerHTML = `
        <div class="page">
          <div class="page-head"><h1>Zähler</h1></div>
          <div class="tabs"><a href="#/ablesung" class="is-active">Ablesen</a><a href="#/verbrauch">Verbrauch</a></div>
          <div class="controls">
            <div class="segmented" role="group" aria-label="Zählerart">
              <button type="button" data-type="strom" class="${this.type === 'strom' ? 'is-active' : ''}">Strom</button>
              <button type="button" data-type="gas" class="${this.type === 'gas' ? 'is-active' : ''}">Gas</button>
            </div>
            <label class="field"><span>Ablesedatum</span><input type="date" id="a-date" value="${this.date}"></label>
            <label class="field"><span>${this.type === 'strom' ? 'Kasten' : 'Tank'}</span>
              <select id="a-group">${groupOpts.map(([v, l]) => `<option value="${v}"${v === this.group ? ' selected' : ''}>${h(l)}</option>`).join('')}</select></label>
            <label class="chip" style="align-self:flex-end"><input type="checkbox" id="a-open" ${this.onlyOpen ? 'checked' : ''} style="accent-color:var(--wald)"> nur offene</label>
          </div>
          <div class="small muted" id="a-progress-text"></div>
          <div class="progress"><div id="a-progress"></div></div>
          <div id="a-list"></div>
          <div class="save-bar">
            <span id="a-pending" class="small"></span>
            <button type="button" class="btn" id="a-save">Speichern</button>
          </div>
        </div>`;

      $$('[data-type]', root).forEach((b) => b.onclick = () => {
        if (Object.keys(this.draft).length && !confirm('Nicht gespeicherte Eingaben verwerfen?')) return;
        this.draft = {}; this.type = b.dataset.type; this.group = 'alle';
        this.render(root, new URLSearchParams());
      });
      $('#a-date', root).onchange = (e) => {
        if (Object.keys(this.draft).length && !confirm('Nicht gespeicherte Eingaben verwerfen?')) { e.target.value = this.date; return; }
        this.draft = {}; this.date = e.target.value || today(); this.renderList();
      };
      $('#a-group', root).onchange = (e) => { this.group = e.target.value; this.renderList(); };
      $('#a-open', root).onchange = (e) => { this.onlyOpen = e.target.checked; this.renderList(); };
      $('#a-save', root).onclick = () => this.save();
      this.renderList();
    },

    meters() {
      return S.data.meters.filter((m) => m.type === this.type);
    },

    groups() {
      const meters = this.meters();
      const groups = [];
      if (this.type === 'strom') {
        S.boxesSorted().forEach((b) => groups.push({ key: b.id, title: `Kasten ${b.nr}`, sub: b.location, pin: `<span class="pin pin-box">${ICON.strom}<span>${h(b.nr)}</span></span>`, meters: S.metersInBox(b.id).filter((m) => m.type === 'strom') }));
        groups.push({ key: 'haus', title: 'Im Haus', sub: 'Zähler beim Mieter', pin: '', meters: meters.filter((m) => m.inHouse) });
        groups.push({ key: 'ohne', title: 'Ohne Kasten', sub: '', pin: '', meters: meters.filter((m) => !m.inHouse && !S.box(m.boxId)) });
      } else {
        const byTank = (tid) => meters.filter((m) => { const p = S.parcel(m.parcelId); return p && p.gas === 'tank' && p.gasTankId === tid; });
        S.tanksSorted().forEach((t) => groups.push({ key: t.id, title: `Gastank ${t.nr}`, sub: t.capacity, pin: `<span class="pin pin-tank">${ICON.gas}<span>T${h(t.nr)}</span></span>`, meters: byTank(t.id) }));
        groups.push({ key: 'ohne', title: 'Ohne Tank', sub: '', pin: '', meters: meters.filter((m) => { const p = S.parcel(m.parcelId); return !p || p.gas !== 'tank' || !S.tank(p.gasTankId); }) });
      }
      groups.forEach((g) => { g.meters = S.sortMeters(g.meters); });
      return groups.filter((g) => g.meters.length && (this.group === 'alle' || this.group === g.key));
    },

    rowState(m) {
      const saved = S.data.readings.find((r) => r.meterId === m.id && r.date === this.date);
      const prev = S.readingBefore(m.id, this.date, false);
      const raw = this.draft[m.id] !== undefined ? this.draft[m.id] : (saved ? String(saved.value).replace('.', ',') : '');
      const val = parseNum(raw);
      const diff = !isNaN(val) && prev ? val - prev.value : null;
      return { saved, prev, raw, val, diff, warn: diff !== null && diff < 0 };
    },

    renderList() {
      const groups = this.groups();
      const all = groups.flatMap((g) => g.meters);
      const done = all.filter((m) => this.rowState(m).saved).length;
      $('#a-progress-text').textContent = `${done} von ${all.length} Zählern für den ${fmtDate(this.date)} erfasst`;
      $('#a-progress').style.width = all.length ? `${(done / all.length) * 100}%` : '0';

      const html = groups.map((g) => {
        const ms = g.meters.filter((m) => !this.onlyOpen || !this.rowState(m).saved || this.draft[m.id] !== undefined);
        if (!ms.length) return '';
        return `<div class="group">
          <div class="group-title">${g.pin}<h3>${h(g.title)}</h3>${g.sub ? `<span class="muted small">${h(g.sub)}</span>` : ''}</div>
          ${ms.map((m) => this.rowHtml(m)).join('')}
        </div>`;
      }).join('');
      $('#a-list').innerHTML = html || '<p class="muted" style="text-align:center;padding:20px">Keine Zähler in dieser Auswahl.</p>';

      $$('#a-list input[data-meter]').forEach((inp) => {
        inp.addEventListener('input', () => {
          this.draft[inp.dataset.meter] = inp.value;
          if (inp.value.trim() === '') delete this.draft[inp.dataset.meter];
          this.updateRow(inp.closest('.reading-row'), S.meter(inp.dataset.meter));
          this.updatePending();
        });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const inputs = $$('#a-list input[data-meter]');
            const next = inputs[inputs.indexOf(inp) + 1];
            if (next) next.focus(); else inp.blur();
          }
        });
      });
      this.updatePending();
    },

    rowHtml(m) {
      const p = S.parcel(m.parcelId);
      const st = this.rowState(m);
      return `<div class="reading-row${st.warn ? ' is-warn' : st.saved ? ' is-done' : ''}">
        ${p ? nrBadge(p, 'nr-sm') : serviceBadge()}
        <div class="who"><strong>${p ? h(tenantName(p)) : h(S.purposeText(m))}</strong><span class="mono muted small">${h(m.number || 'ohne Nr.')}</span></div>
        <div class="prev">${st.prev ? `Vorher: <strong class="mono">${fmtNum(st.prev.value)}</strong> (${fmtDate(st.prev.date)})` : 'kein vorheriger Stand'}</div>
        <input type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" data-meter="${m.id}" value="${h(st.raw)}" placeholder="Neuer Stand" aria-label="Zählerstand ${p ? 'Parzelle ' + h(p.nr) : h(S.purposeText(m))}">
        <div class="diff">${this.diffHtml(m, st)}</div>
      </div>`;
    },

    diffHtml(m, st) {
      if (st.diff === null) return st.saved && this.draft[m.id] === undefined ? '<span class="muted small">gespeichert</span>' : '';
      if (st.warn) return `<span class="warn">${fmtNum(st.diff)} ${unit(m.type)} ⚠</span>`;
      return `+${fmtNum(st.diff)} ${unit(m.type)}`;
    },

    updateRow(row, m) {
      const st = this.rowState(m);
      row.classList.toggle('is-warn', st.warn);
      row.classList.toggle('is-done', !st.warn && !!st.saved);
      $('.diff', row).innerHTML = this.diffHtml(m, st);
    },

    updatePending() {
      const n = Object.keys(this.draft).length;
      const el = $('#a-pending');
      if (el) el.textContent = n ? `${n} neue Eingabe${n === 1 ? '' : 'n'} – noch nicht gespeichert` : 'Alle Eingaben gespeichert';
      const btn = $('#a-save');
      if (btn) btn.disabled = !n;
    },

    save() {
      const entries = Object.entries(this.draft);
      const invalid = entries.filter(([, v]) => isNaN(parseNum(v)));
      if (invalid.length) { toast(`${invalid.length} Eingabe(n) sind keine gültige Zahl`); return; }
      const warnings = entries.filter(([id, v]) => {
        const prev = S.readingBefore(id, this.date, false);
        return prev && parseNum(v) < prev.value;
      });
      if (warnings.length && !confirm(`${warnings.length} Zählerstand/-stände sind kleiner als der vorherige Stand (Zählertausch oder Tippfehler?).\nTrotzdem speichern?`)) return;
      entries.forEach(([id, v]) => S.upsertReading(id, this.date, parseNum(v)));
      this.draft = {};
      S.save();
      toast(`${entries.length} ${entries.length === 1 ? 'Zählerstand' : 'Zählerstände'} gespeichert`);
      this.renderList();
    },
  };

  const Verbrauch = {
    type: 'strom', mode: 'last2', from: null, to: null,

    // mode 'last2': je Zähler die letzten beiden Ablesungen; mode 'range': gewählter Zeitraum
    compute() {
      const rows = S.data.meters.filter((m) => m.type === this.type).map((m) => {
        const p = S.parcel(m.parcelId);
        let a, b;
        if (this.mode === 'last2') {
          const rs = S.readingsOf(m.id);
          b = rs[rs.length - 1] || null;
          a = rs[rs.length - 2] || null;
        } else {
          a = this.from ? S.readingBefore(m.id, this.from, true) : null;
          b = this.to ? S.readingBefore(m.id, this.to, true) : null;
        }
        const valid = a && b && a.id !== b.id && b.date > a.date;
        return { m, p, a, b: valid || this.mode === 'last2' ? b : null, diff: valid ? b.value - a.value : null };
      });
      const order = S.sortMeters(rows.map((r) => r.m));
      rows.sort((x, y) => order.indexOf(x.m) - order.indexOf(y.m));
      return rows;
    },

    place(m) { return S.meterPlace(m) || (m.type === 'strom' ? 'ohne Kasten' : ''); },

    render(root) {
      const dates = S.readingDates(this.type);
      if (!dates.includes(this.to)) this.to = dates[dates.length - 1] || null;
      if (!dates.includes(this.from) || this.from >= this.to) this.from = dates.filter((d) => d < this.to).pop() || null;
      const rows = this.compute();
      const ok = rows.filter((r) => r.diff !== null);
      const total = ok.reduce((s, r) => s + r.diff, 0);
      const parcelTotal = ok.filter((r) => r.p).reduce((s, r) => s + r.diff, 0);
      const missing = rows.length - ok.length;
      const u = unit(this.type);
      const reading = (r) => (r ? `${fmtNum(r.value)} <span class="muted small">(${fmtDate(r.date)})</span>` : '<span class="warn">fehlt</span>');

      root.innerHTML = `
        <div class="page">
          <div class="page-head"><h1>Zähler</h1></div>
          <div class="tabs"><a href="#/ablesung">Ablesen</a><a href="#/verbrauch" class="is-active">Verbrauch</a></div>
          <div class="controls">
            <div class="segmented" role="group" aria-label="Zählerart">
              <button type="button" data-type="strom" class="${this.type === 'strom' ? 'is-active' : ''}">Strom</button>
              <button type="button" data-type="gas" class="${this.type === 'gas' ? 'is-active' : ''}">Gas</button>
            </div>
            <label class="field"><span>Vergleich</span><select id="v-mode">
              <option value="last2"${this.mode === 'last2' ? ' selected' : ''}>Letzte zwei Ablesungen je Zähler</option>
              <option value="range"${this.mode === 'range' ? ' selected' : ''}>Zeitraum wählen</option>
            </select></label>
            ${this.mode === 'range' ? `
            <label class="field"><span>Von Ablesung</span><select id="v-from">${dates.map((d) => `<option value="${d}"${d === this.from ? ' selected' : ''}>${fmtDate(d)}</option>`).join('')}</select></label>
            <label class="field"><span>Bis Ablesung</span><select id="v-to">${dates.map((d) => `<option value="${d}"${d === this.to ? ' selected' : ''}>${fmtDate(d)}</option>`).join('')}</select></label>` : ''}
            <button class="btn" id="v-csv" ${rows.length ? '' : 'disabled'}>${ICON.download} CSV-Liste</button>
          </div>
          ${dates.length < 2 ? '<p class="notice">Für eine Verbrauchsberechnung werden mindestens zwei Ablesungen benötigt.</p>' : ''}
          <div class="summary">
            <div class="stat"><div class="v">${fmtNum(total)} ${u}</div><div class="l">Gesamtverbrauch</div></div>
            <div class="stat"><div class="v">${fmtNum(parcelTotal)} ${u}</div><div class="l">davon Parzellen</div></div>
            <div class="stat"><div class="v">${fmtNum(total - parcelTotal)} ${u}</div><div class="l">davon Betrieb</div></div>
            <div class="stat"><div class="v" style="${missing ? 'color:var(--gefahr)' : ''}">${missing}</div><div class="l">Zähler ohne vollständige Werte</div></div>
          </div>
          <div class="table-wrap">
            <table class="table-cards">
              <thead><tr><th>Parzelle</th><th>Name</th><th>Zähler-Nr.</th><th>Zählerschrank</th><th class="num">Letzter Stand</th><th class="num">Aktueller Stand</th><th class="num">Differenz</th></tr></thead>
              <tbody>
                ${rows.map((r) => `<tr>
                  <td data-label="Parzelle">${r.p ? `<a href="#/parzelle/${r.p.id}"><strong>${h(r.p.nr)}</strong></a>` : '<span class="badge badge-service">Betrieb</span>'}</td>
                  <td data-label="Name">${r.p ? h(tenantName(r.p)) : h(S.purposeText(r.m))}</td>
                  <td data-label="Zähler-Nr." class="mono">${h(r.m.number)}</td>
                  <td data-label="Zählerschrank">${h(this.place(r.m))}</td>
                  <td data-label="Letzter Stand" class="num">${reading(r.a)}</td>
                  <td data-label="Aktueller Stand" class="num">${reading(r.b)}</td>
                  <td data-label="Differenz" class="num"><strong${r.diff < 0 ? ' class="warn"' : ''}>${r.diff === null ? '–' : `${fmtNum(r.diff)} ${u}`}</strong></td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr><td colspan="6" data-label="Summe">Summe</td><td class="num" data-label="Gesamt">${fmtNum(total)} ${u}</td></tr></tfoot>
            </table>
          </div>
        </div>`;

      $$('[data-type]', root).forEach((b) => b.onclick = () => { this.type = b.dataset.type; this.from = this.to = null; this.render(root); });
      $('#v-mode', root).onchange = (e) => { this.mode = e.target.value; this.render(root); };
      const fromSel = $('#v-from', root), toSel = $('#v-to', root);
      if (fromSel) fromSel.onchange = () => { this.from = fromSel.value; this.render(root); };
      if (toSel) toSel.onchange = () => { this.to = toSel.value; this.render(root); };
      $('#v-csv', root).onclick = () => {
        const data = [['Parzelle', 'Name', 'Zählernummer', 'Zählerschrank', 'Letzter Zählerstand', 'Datum letzter Stand',
          'Aktueller Zählerstand', 'Datum aktueller Stand', `Differenz (${u})`]];
        rows.forEach((r) => data.push([
          r.p ? r.p.nr : 'Betrieb', r.p ? r.p.tenant.name : S.purposeText(r.m), r.m.number, this.place(r.m),
          r.a ? r.a.value : '', r.a ? fmtDate(r.a.date) : '', r.b ? r.b.value : '', r.b ? fmtDate(r.b.date) : '', r.diff ?? '',
        ]));
        const suffix = this.mode === 'last2' ? today() : `${this.from}_${this.to}`;
        download(`zaehlerstaende-${this.type}-${suffix}.csv`, csv(data), 'text/csv;charset=utf-8');
      };
    },
  };

  /* ======================================================================
     DATEN
     ====================================================================== */

  const Daten = {
    render(root) {
      const d = S.data;
      root.innerHTML = `
        <div class="page">
          <div class="page-head"><h1>Daten</h1></div>
          <div class="summary">
            <div class="stat"><div class="v">${d.parcels.length}</div><div class="l">Parzellen</div></div>
            <div class="stat"><div class="v">${d.boxes.length}</div><div class="l">Stromkästen</div></div>
            <div class="stat"><div class="v">${d.tanks.length}</div><div class="l">Gastanks</div></div>
            <div class="stat"><div class="v">${d.meters.length}</div><div class="l">Zähler</div></div>
            <div class="stat"><div class="v">${d.readings.length}</div><div class="l">Ablesungen</div></div>
          </div>
          ${d.demo && S.mode === 'local' ? '<p class="notice"><strong>Demo-Daten:</strong> Alle Namen, Nummern und Zählerstände sind erfunden und dienen nur zum Ausprobieren.</p>' : ''}
          <div class="cards">
            ${S.mode === 'cloud' ? `
            <section class="card">
              <h2>Konto</h2>
              <dl class="facts">
                <dt>Angemeldet als</dt><dd>${h(Cloud.user && Cloud.user.email)}</dd>
                <dt>Speicherort</dt><dd>Zentrale Datenbank</dd>
                <dt>Stand geladen</dt><dd>${new Date(S.lastFetch).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</dd>
              </dl>
              <div class="card-actions">
                <button class="btn btn-ghost" id="d-refresh">Neu laden</button>
                <button class="btn btn-dark" id="d-logout">Abmelden</button>
              </div>
            </section>` : `
            <section class="card">
              <h2>Lokaler Testmodus</h2>
              <p class="small">Es ist noch keine Datenbank verbunden. Die Daten liegen <strong>nur in diesem Browser auf diesem Gerät</strong> – ideal zum Ausprobieren.</p>
              <p class="small muted">Sobald in <code>js/config.js</code> die Supabase-Zugangsdaten eingetragen sind, erscheint eine Anmeldung und alle Geräte arbeiten mit demselben Datenbestand (siehe SETUP.md).</p>
            </section>`}
            <section class="card">
              <h2>Sicherung</h2>
              <div class="card-actions" style="margin-top:0">
                <button class="btn" id="d-export">${ICON.download} Sicherung exportieren</button>
                <label class="btn btn-ghost" style="cursor:pointer">${ICON.upload} Sicherung importieren<input type="file" id="d-import" accept="application/json,.json" hidden></label>
              </div>
              <p class="small muted">Export als JSON-Datei. Beim Import wird der aktuelle Stand ersetzt.</p>
            </section>
            <section class="card">
              <h2>Listen exportieren</h2>
              <div class="card-actions" style="margin-top:0">
                <button class="btn btn-ghost" id="d-csv">${ICON.download} Kartei als CSV (Excel)</button>
              </div>
            </section>
            <section class="card">
              <h2>Zurücksetzen</h2>
              <div class="card-actions" style="margin-top:0">
                <button class="btn btn-ghost" id="d-demo">Demo-Daten laden</button>
                <button class="btn btn-danger" id="d-clear">Leeren Bestand anlegen</button>
              </div>
              <p class="small muted">${S.mode === 'cloud' ? '<strong>Achtung:</strong> Beides überschreibt die zentrale Datenbank für alle Benutzer' : 'Beides überschreibt den aktuellen Stand'} – vorher eine Sicherung exportieren!</p>
            </section>
          </div>
        </div>`;

      $('#d-export', root).onclick = () => download(`platzverwaltung-sicherung-${today()}.json`, JSON.stringify(S.data, null, 2), 'application/json');
      $('#d-import', root).onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const obj = JSON.parse(reader.result);
            if (!reallyOverwrite(`Sicherung mit ${obj.parcels?.length ?? 0} Parzellen importieren und den aktuellen Stand ersetzen`)) return;
            S.importJSON(obj); toast('Sicherung importiert'); this.render(root);
          } catch (err) { alert('Import fehlgeschlagen: ' + err.message); }
        };
        reader.readAsText(file);
      };
      $('#d-csv', root).onclick = () => {
        const rows = [['Parzelle', 'Status', 'Objektart', 'Mieter', 'Telefon', 'E-Mail', 'Anschrift', 'Größe (m²)', 'Pacht/Miete mtl. (€)',
          'Winterwasser', 'Heizung', 'Gas', 'Gastank', 'Stromzähler', 'Zählerort', 'Gaszähler', 'Notizen']];
        S.parcelsSorted().forEach((p) => {
          const ms = S.metersOf(p.id);
          const st = ms.filter((m) => m.type === 'strom');
          const gs = ms.filter((m) => m.type === 'gas');
          rows.push([p.nr, statusOf(p).label, objectOf(p).label, p.tenant.name, p.tenant.phone, p.tenant.email, p.tenant.address, p.size, p.rent,
            p.winterWater ? 'ja' : 'nein', S.HEATING[p.heating] || '', S.GAS[p.gas] || '', S.tank(p.gasTankId)?.nr ?? '',
            st.map((m) => m.number).join(', '), st.map((m) => S.meterPlace(m)).join(', '),
            gs.map((m) => m.number).join(', '), p.notes]);
        });
        download(`kartei-${today()}.csv`, csv(rows), 'text/csv;charset=utf-8');
      };
      // In der Datenbank nur nach ausdrücklicher Bestätigung überschreiben
      const reallyOverwrite = (what) => S.mode !== 'cloud'
        ? confirm(`${what}?`)
        : (prompt(`${what}?\n\nDas betrifft die zentrale Datenbank für alle Benutzer. Zum Bestätigen LÖSCHEN eingeben:`) || '').trim().toUpperCase() === 'LÖSCHEN';
      $('#d-demo', root).onclick = () => { if (reallyOverwrite('Aktuellen Stand durch Demo-Daten ersetzen')) { S.reset(); toast('Demo-Daten geladen'); this.render(root); } };
      const refresh = $('#d-refresh', root);
      if (refresh) refresh.onclick = async () => {
        if (S.hasPending) { toast('Bitte warten, bis alles gespeichert ist'); return; }
        try { await S.refresh(); MapView.render(); toast('Neuester Stand geladen'); this.render(root); } catch (e) { alert('Laden fehlgeschlagen: ' + e.message); }
      };
      const logout = $('#d-logout', root);
      if (logout) logout.onclick = async () => {
        if (S.hasPending && !confirm('Es werden noch Änderungen gespeichert. Trotzdem abmelden?')) return;
        await Cloud.signOut();
        location.reload();
      };
      $('#d-clear', root).onclick = () => {
        if (!reallyOverwrite('Wirklich ALLE Daten löschen und mit einem leeren Bestand starten')) return;
        S.clearAll(); toast('Leerer Bestand angelegt'); this.render(root);
      };
    },
  };

  /* ======================================================================
     ROUTER
     ====================================================================== */

  function route() {
    const raw = location.hash.replace(/^#\/?/, '') || 'karte';
    const [path, query] = raw.split('?');
    const parts = path.split('/');
    const params = new URLSearchParams(query || '');
    const viewMap = $('#view-karte');
    const viewPage = $('#view-page');
    const nav = { karte: 'karte', kartei: 'kartei', parzelle: 'kartei', neu: 'kartei', technik: 'technik', kasten: 'technik', ablesung: 'ablesung', verbrauch: 'ablesung', daten: 'daten' }[parts[0]] || 'karte';
    $$('.tabbar a').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === nav));

    if (nav === 'karte') {
      viewPage.hidden = true;
      viewMap.hidden = false;
      MapView.invalidate();
      const [, type, id] = parts;
      if (type && id && ['parcel', 'box', 'tank'].includes(type)) {
        const changed = !MapView.selected || MapView.selected.id !== id;
        MapView.select(type, id, { focus: changed });
        MapUI.showPanel(type, id);
      } else {
        MapView.select(null);
        MapUI.hidePanel();
      }
      document.title = 'Karte · Platzverwaltung';
      return;
    }

    // Seite verlassen → laufende Kartenmodi abbrechen
    if (MapView.mode) MapView.cancelMode();
    viewMap.hidden = true;
    viewPage.hidden = false;
    viewPage.scrollTop = 0;
    const titles = { kasten: 'Stromkasten', kartei: 'Kartei', parzelle: 'Parzelle', neu: 'Neue Parzelle', technik: 'Technik', ablesung: 'Ablesung', verbrauch: 'Verbrauch', daten: 'Daten' };
    document.title = `${titles[parts[0]] || ''} · Platzverwaltung`;

    switch (parts[0]) {
      case 'kartei': Kartei.render(viewPage); break;
      case 'parzelle':
        if (parts[2] === 'bearbeiten') Edit.render(viewPage, parts[1]);
        else Detail.render(viewPage, parts[1]);
        break;
      case 'neu': Edit.render(viewPage, null); break;
      case 'technik': Technik.render(viewPage); break;
      case 'kasten': BoxEdit.render(viewPage, parts[1]); break;
      case 'ablesung': Ablesung.render(viewPage, params); break;
      case 'verbrauch': Verbrauch.render(viewPage); break;
      case 'daten': Daten.render(viewPage); break;
      default: location.hash = '#/karte';
    }
  }

  // Navigieren – auch wenn der Hash gleich bleibt, wird neu gerendert
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }

  /* ---------- Speicherstatus ---------- */

  function renderSync() {
    const el = $('#sync-status');
    el.hidden = false;
    el.onclick = null;
    if (S.mode === 'local') {
      el.className = 'sync is-local is-ok';
      el.innerHTML = '<span>Testmodus</span>';
      el.title = 'Lokaler Testmodus: Daten nur in diesem Browser';
      return;
    }
    const st = S.sync.state;
    el.className = 'sync' + (st === 'saving' ? ' is-saving' : st === 'error' ? ' is-error' : ' is-ok');
    el.innerHTML = `<span>${st === 'saving' ? 'Speichert …' : st === 'error' ? 'Nicht gespeichert' : 'Gespeichert'}</span>`;
    el.setAttribute('aria-label', el.textContent);
    el.title = st === 'error' ? `Fehler: ${S.sync.error} – antippen zum erneuten Versuch` : 'Alle Änderungen sind in der Datenbank gespeichert';
    if (st === 'error') el.onclick = () => S.retry();
    // Fehlende Spalten → Datenbank-Update (supabase/update-2.sql) noch nicht ausgeführt
    if (st === 'error' && /column|schema cache/i.test(S.sync.error) && !renderSync.warned) {
      renderSync.warned = true;
      alert('Die Datenbank muss aktualisiert werden, bevor neue Felder gespeichert werden können.\n\n'
        + 'Bitte im Supabase „SQL Editor“ das Update-Skript (supabase/update-2.sql) ausführen und danach erneut speichern.\n\n'
        + `Technische Meldung: ${S.sync.error}`);
    }
  }

  // Cloud: beim Zurückkehren zur App den neuesten Stand holen (z. B. Änderungen vom anderen Gerät)
  async function refreshIfIdle() {
    if (S.mode !== 'cloud' || S.hasPending || S.sync.state === 'error') return;
    if (Date.now() - S.lastFetch < 30000) return;
    if (/^#\/(neu|parzelle\/[^/]+\/bearbeiten)/.test(location.hash)) return;
    if (Object.keys(Ablesung.draft).length || MapView.mode || $('#dialog').open) return;
    try {
      if (!(await S.refresh())) return;
      MapView.render();
      route();
    } catch (e) {
      console.warn('Aktualisieren fehlgeschlagen', e);
    }
  }

  /* ---------- Start ---------- */

  async function start() {
    if (window.Cloud && Cloud.enabled) {
      await Auth.ensure();
      Auth.loading('Daten werden geladen …');
      for (;;) {
        try { await S.init(); break; } catch (e) {
          console.error(e);
          if (!confirm(`Daten konnten nicht geladen werden:\n${e.message || e}\n\nErneut versuchen?`)) return;
        }
      }
      Auth.hide();
    } else {
      await S.init();
    }

    MapUI.init();
    S.onSync(renderSync);
    renderSync();

    // Änderungen an den Daten → sichtbare Ansicht aktualisieren
    S.onChange(() => {
      MapView.render();
      const sel = MapView.selected;
      if (!$('#view-karte').hidden && sel) MapUI.showPanel(sel.type, sel.id);
      if (!$('#view-page').hidden && location.hash.startsWith('#/technik')) Technik.render($('#view-page'));
    });

    window.addEventListener('hashchange', route);
    window.addEventListener('resize', () => MapView.invalidate());
    window.addEventListener('online', () => S.retry());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshIfIdle(); });
    window.addEventListener('beforeunload', (e) => {
      if (Object.keys(Ablesung.draft).length || S.hasPending) { e.preventDefault(); e.returnValue = ''; }
    });
    route();
  }

  start();
})();
