/*
 * Login-Bildschirm: Anmelden, Passwort vergessen, Passwort setzen (Einladung/Reset).
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ERRORS = {
    'Invalid login credentials': 'E-Mail oder Passwort ist falsch.',
    'Email not confirmed': 'Die E-Mail-Adresse wurde noch nicht bestätigt.',
    'Email rate limit exceeded': 'Zu viele Versuche – bitte später erneut probieren.',
    'Password should be at least 6 characters.': 'Das Passwort muss mindestens 6 Zeichen haben.',
    'New password should be different from the old password.': 'Das neue Passwort muss sich vom alten unterscheiden.',
    'Failed to fetch': 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.',
  };
  const msg = (e) => {
    const m = (e && (e.message || e.error_description)) || String(e);
    return ERRORS[m] || m;
  };

  const Auth = {
    el: null,

    show(html) {
      this.el = $('#auth');
      document.body.classList.add('is-locked');
      this.el.hidden = false;
      $('#auth-body').innerHTML = html;
    },

    hide() {
      document.body.classList.remove('is-locked');
      $('#auth').hidden = true;
    },

    loading(text) {
      this.show(`<p class="auth-loading"><span class="spinner"></span>${h(text || 'Wird geladen …')}</p>`);
    },

    // Wartet, bis ein freigeschalteter Benutzer angemeldet ist
    async ensure() {
      // Infos aus dem E-Mail-Link (Einladung / Passwort zurücksetzen) sichern,
      // bevor der Supabase-Client den Hash verarbeitet
      const hash = location.hash;
      const linkType = (/[#&]type=(invite|recovery|signup|magiclink)/.exec(hash) || [])[1];
      const linkError = (/[#&]error_description=([^&]+)/.exec(hash) || [])[1];

      this.loading('Verbindung wird hergestellt …');
      Cloud.init();
      let session = null;
      try {
        session = await Cloud.getSession();
      } catch (e) {
        console.warn(e);
      }
      if (/access_token=|error_description=|[#&]code=/.test(location.hash)) {
        history.replaceState(null, '', location.pathname + location.search + '#/karte');
      }

      if (session && (linkType === 'invite' || linkType === 'recovery')) {
        await this.setPasswordForm(linkType);
      }

      for (;;) {
        if (!session) session = await this.loginForm(linkError ? decodeURIComponent(linkError.replace(/\+/g, ' ')) : '');
        this.loading('Zugang wird geprüft …');
        try {
          if (await Cloud.isMember()) break;
          await this.noAccess();
        } catch (e) {
          await this.setupError(e);
        }
        session = null;
      }

      Cloud.onSignedOut(() => location.reload());
      this.hide();
    },

    loginForm(errorText) {
      return new Promise((resolve) => {
        this.show(`
          <form id="auth-form" novalidate>
            <h2>Anmelden</h2>
            ${errorText ? `<p class="auth-error">${h(errorText)}</p>` : ''}
            <label class="field"><span>E-Mail</span><input type="email" name="email" autocomplete="username" inputmode="email" required></label>
            <label class="field"><span>Passwort</span><input type="password" name="password" autocomplete="current-password" required></label>
            <p class="auth-error" id="auth-error" hidden></p>
            <button type="submit" class="btn auth-submit">Anmelden</button>
            <button type="button" class="link-btn auth-link" id="auth-forgot">Passwort vergessen?</button>
          </form>`);
        const form = $('#auth-form');
        const err = $('#auth-error');
        form.elements.email.value = localStorage.getItem('wch-last-email') || '';
        (form.elements.email.value ? form.elements.password : form.elements.email).focus();
        form.onsubmit = async (e) => {
          e.preventDefault();
          const email = form.elements.email.value.trim();
          const password = form.elements.password.value;
          if (!email || !password) { err.textContent = 'Bitte E-Mail und Passwort eingeben.'; err.hidden = false; return; }
          const btn = $('.auth-submit', form);
          btn.disabled = true; btn.textContent = 'Anmelden …';
          try {
            const session = await Cloud.signIn(email, password);
            try { localStorage.setItem('wch-last-email', email); } catch (_) { /* egal */ }
            resolve(session);
          } catch (ex) {
            err.textContent = msg(ex); err.hidden = false;
            btn.disabled = false; btn.textContent = 'Anmelden';
          }
        };
        $('#auth-forgot').onclick = () => this.forgotForm(form.elements.email.value.trim()).then(() => this.loginForm('').then(resolve));
      });
    },

    forgotForm(email) {
      return new Promise((resolve) => {
        this.show(`
          <form id="auth-form" novalidate>
            <h2>Passwort vergessen</h2>
            <p class="small muted">Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.</p>
            <label class="field"><span>E-Mail</span><input type="email" name="email" autocomplete="username" inputmode="email" value="${h(email)}"></label>
            <p class="auth-error" id="auth-error" hidden></p>
            <button type="submit" class="btn auth-submit">Link senden</button>
            <button type="button" class="link-btn auth-link" id="auth-back">Zurück zur Anmeldung</button>
          </form>`);
        const form = $('#auth-form');
        const err = $('#auth-error');
        $('#auth-back').onclick = () => resolve();
        form.onsubmit = async (e) => {
          e.preventDefault();
          const mail = form.elements.email.value.trim();
          if (!mail) { err.textContent = 'Bitte E-Mail eingeben.'; err.hidden = false; return; }
          const btn = $('.auth-submit', form);
          btn.disabled = true;
          try {
            await Cloud.sendPasswordReset(mail);
            this.show(`
              <h2>E-Mail ist unterwegs</h2>
              <p class="small">Falls <strong>${h(mail)}</strong> freigeschaltet ist, kommt in Kürze eine E-Mail mit einem Link zum Zurücksetzen. Bitte auch den Spam-Ordner prüfen.</p>
              <button type="button" class="btn auth-submit" id="auth-back">Zurück zur Anmeldung</button>`);
            $('#auth-back').onclick = () => resolve();
          } catch (ex) {
            err.textContent = msg(ex); err.hidden = false; btn.disabled = false;
          }
        };
      });
    },

    setPasswordForm(type) {
      return new Promise((resolve) => {
        this.show(`
          <form id="auth-form" novalidate>
            <h2>${type === 'invite' ? 'Willkommen! Passwort festlegen' : 'Neues Passwort festlegen'}</h2>
            <label class="field"><span>Neues Passwort (mind. 8 Zeichen)</span><input type="password" name="p1" autocomplete="new-password"></label>
            <label class="field"><span>Passwort wiederholen</span><input type="password" name="p2" autocomplete="new-password"></label>
            <p class="auth-error" id="auth-error" hidden></p>
            <button type="submit" class="btn auth-submit">Passwort speichern</button>
          </form>`);
        const form = $('#auth-form');
        const err = $('#auth-error');
        form.elements.p1.focus();
        form.onsubmit = async (e) => {
          e.preventDefault();
          const p1 = form.elements.p1.value, p2 = form.elements.p2.value;
          if (p1.length < 8) { err.textContent = 'Das Passwort muss mindestens 8 Zeichen haben.'; err.hidden = false; return; }
          if (p1 !== p2) { err.textContent = 'Die Passwörter stimmen nicht überein.'; err.hidden = false; return; }
          const btn = $('.auth-submit', form);
          btn.disabled = true;
          try {
            await Cloud.setPassword(p1);
            resolve();
          } catch (ex) {
            err.textContent = msg(ex); err.hidden = false; btn.disabled = false;
          }
        };
      });
    },

    noAccess() {
      return new Promise((resolve) => {
        this.show(`
          <h2>Kein Zugriff</h2>
          <p class="small">Du bist als <strong>${h(Cloud.user && Cloud.user.email)}</strong> angemeldet, aber für die Platzverwaltung (noch) nicht freigeschaltet. Bitte wende dich an die Platzleitung.</p>
          <button type="button" class="btn auth-submit" id="auth-out">Abmelden</button>`);
        $('#auth-out').onclick = async () => { await Cloud.signOut(); resolve(); };
      });
    },

    setupError(e) {
      return new Promise((resolve) => {
        this.show(`
          <h2>Datenbank nicht erreichbar</h2>
          <p class="auth-error">${h(msg(e))}</p>
          <p class="small muted">Ist die Datenbank eingerichtet (supabase/schema.sql ausgeführt)? Besteht eine Internetverbindung?</p>
          <button type="button" class="btn auth-submit" id="auth-retry">Erneut versuchen</button>
          <button type="button" class="link-btn auth-link" id="auth-out">Abmelden</button>`);
        $('#auth-retry').onclick = () => location.reload();
        $('#auth-out').onclick = async () => { await Cloud.signOut(); resolve(); };
      });
    },
  };

  window.Auth = Auth;
})();
