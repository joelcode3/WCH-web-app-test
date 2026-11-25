/*
 * Eigene Rückfragen statt der Browser-Fenster confirm()/prompt()/alert().
 * Grund (25.11.2026): Beim Betreiber (Safari) kamen die Browser-Fenster nicht – „Speichern“ tat dann einfach nichts.
 * Ask.confirm(text, { ok, cancel, danger }) → Promise<boolean>
 * Ask.prompt(text, vorgabe)                 → Promise<string|null>
 * Ask.alert(text)                           → Promise<void>
 * Eigenes <dialog>, liegt also auch über einem schon offenen Fenster.
 */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const queue = [];
  let busy = false;

  function el() {
    let d = document.getElementById('ask');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'ask';
      d.className = 'dialog ask-dialog';
      document.body.appendChild(d);
    }
    return d;
  }

  function show(kind, text, opts) {
    return new Promise((resolve) => {
      queue.push({ kind, text, opts: opts || {}, resolve });
      next();
    });
  }

  function next() {
    if (busy || !queue.length) return;
    busy = true;
    const { kind, text, opts, resolve } = queue.shift();
    const d = el();
    const ok = opts.ok || (kind === 'alert' ? 'OK' : kind === 'prompt' ? 'OK' : 'Ja');
    const cancel = opts.cancel || 'Abbrechen';
    d.innerHTML = `<form method="dialog" novalidate>
        <div class="ask-text">${esc(text).replace(/\n/g, '<br>')}</div>
        ${kind === 'prompt' ? `<input type="text" name="v" autocomplete="off" value="${esc(opts.value)}">` : ''}
        <div class="dialog-actions">
          ${kind === 'alert' ? '' : `<button type="button" class="btn btn-ghost" data-no>${esc(cancel)}</button>`}
          <button type="submit" class="btn${opts.danger ? ' btn-danger' : ''}" data-yes>${esc(ok)}</button>
        </div>
      </form>`;
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      if (d.open) d.close();
      busy = false;
      resolve(val);
      setTimeout(next, 0);
    };
    const form = d.querySelector('form');
    const inp = d.querySelector('input[name=v]');
    form.onsubmit = (e) => { e.preventDefault(); finish(kind === 'confirm' ? true : kind === 'prompt' ? inp.value : undefined); };
    const no = d.querySelector('[data-no]');
    if (no) no.onclick = () => finish(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined);
    d.oncancel = (e) => { e.preventDefault(); finish(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined); };
    d.showModal();
    (inp || d.querySelector('[data-yes]')).focus();
    if (inp) inp.select();
  }

  window.Ask = {
    confirm: (text, opts) => show('confirm', text, opts),
    prompt: (text, value, opts) => show('prompt', text, { ...(opts || {}), value: value ?? '' }),
    alert: (text, opts) => show('alert', text, opts),
  };
  // Hinweise (alert) blockieren nirgends den weiteren Ablauf – daher überall durch das eigene Fenster ersetzen
  window.alert = (text) => { window.Ask.alert(text); };
})();
