# Platzverwaltung Waldcamping Hesedorf – Notizen für Claude

Diese Datei hält die Absprachen fest, damit jede neue Sitzung nahtlos weiterarbeiten kann.

## Zusammenarbeit
- **Immer auf Deutsch antworten**, einfach und Schritt für Schritt erklären (der Betreiber ist kein Entwickler).
  Klicks in GitHub/Supabase genau beschreiben (Supabase-Oberfläche ist englisch).
- **Änderungen immer als Pull Request** auf dem vorgegebenen Arbeitszweig; der Betreiber merged selbst
  („Merge pull request“ → „Confirm merge“, danach 2–3 Min. bis GitHub Pages aktualisiert ist).
  Ist der letzte PR schon gemergt: Arbeitszweig neu auf `origin/main` setzen; sonst weitere Commits in den offenen PR.
- Nach jedem PR kurz sagen, was der Betreiber tun muss (mergen, ggf. SQL-Update ausführen).
- **Keine Emojis** – weder in der App (Symbole als SVG-Linien-Icons) noch in Antworten.
- Größere Aufträge komplett abarbeiten, vorher im Browser testen (Computer- und iPhone-Ansicht).

## Begriffe und Gestaltung (vom Betreiber festgelegt)
- Reiter: **Map · Parzellen · Infrastruktur · airbnb · To-Dos · Daten** (Infrastruktur hat Unterreiter
  Strom, Gas, Ablesen, Verbrauch, Auslastung). Kein Zähler am Reiter To-Dos.
- „airbnb“ immer klein geschrieben.
- Status: Festwohnsitz (#1f4e8c), Freizeitgrundstück (#6fa8dc), Reserviert (#2b6a33),
  Frei – bezugsfertig (#6cbf5a), Frei – zu räumen (#ec8a2c); „wird frei“ = bewohnt mit Auszugstermin (diagonal).
- Objektart nur „Pachtgrundstück“ / „Mietobjekt“ (ohne Zusätze).
- airbnb-Kalender: belegt dunkelrot (#9b3b3b), frei weiß, geblockt grau.
- airbnb-Unterkünfte auf der Map als Draufsicht in Originalgröße (Londonbus, Glampingzelt,
  Bäckerwagen = Kastenwagen creme/dunkelgrün), drehbar; Reihenfolge Bus 1, Bus 2, Zelt 1, Zelt 2, Bäckerwagen.
- Gastank-Beschriftung ohne vorangestelltes „T“.
- Parzellennummern: Platz 1 = 1.01–1.30 (unten), Platz 2 = 2.01–2.71 (oben, inkl. Reihe über dem Hauptweg).

## Technik
- Statische Web-App (Vanilla JS, Hash-Router), gehostet auf **GitHub Pages**:
  https://joelcode3.github.io/WCH-web-app-test/
- **Supabase** (Login + Datenbank + Speicher „todo-fotos“ + Edge Function `airbnb-kalender`).
  Zugangsdaten in `js/config.js` (nur der öffentliche Publishable Key – **nie** nach dem Secret-/Service-Key fragen).
  Zugriff nur für E-Mails in der Tabelle `team` (RLS über `is_team_member()`).
- Dateien: `js/data.js` (Datenmodell, Store), `js/cloud.js` (Supabase-Sync, nur Änderungen),
  `js/map.js` (Leaflet-Karte), `js/app.js` (alle Ansichten), `js/airbnb.js`, `js/photos.js`, `js/auth.js`.
- **Versionsnummer** `?v=JJJJMMTT-n` an allen CSS/JS-/Plan-Dateien in `index.html` und `js/config.js`
  bei jeder Änderung hochzählen (sonst zeigt der Browser alte Dateien).
- **Datenbank-Änderungen nur additiv**: neues `supabase/update-N.sql` (idempotent, `if not exists`) und
  denselben Inhalt ans Ende von `schema.sql`. Neue Spalten/Tabellen in `cloud.js` als optional behandeln
  (`OPTIONAL_COLS` bzw. `optional: true`), damit die App auch ohne ausgeführtes Update weiterläuft.
  Bisher: update-2 … update-7 (zuletzt: Kalender-Link/Foto für Orte).
- Lageplan: `tools/plan_import.py` erzeugt `assets/platzplan.svg`, `js/plan-data.js`, Luftbild;
  `tools/render_plan.js` rendert `assets/platzplan.png` (Hintergrund). Eingaben: AutoCAD-PDFs (nicht im Repo).
  Geänderte Nummern übernimmt die App über „Daten → Neue Nummern übernehmen“ (Zuordnung über die Lage,
  Mieter/Zähler bleiben erhalten). Nie die Daten durch einen leeren Plan ersetzen.
- `.github/workflows/supabase-wachhalten.yml` ruft alle 3 Tage `ping()` auf (gegen Pausieren im Gratis-Paket).
- Testen: lokal `python3 -m http.server`, Playwright (Chromium vorinstalliert). Ohne Supabase-Daten in
  `config.js` läuft die App im lokalen Testmodus mit Demo-Daten.

## Offene Themen (Stand 16.10.2026)
- **App-Logo und Titel ändern** – wartet auf Titel und Logo-Datei/Beschreibung vom Betreiber.
- **Eigene Adresse** (z. B. `platz.waldcamping-hesedorf.de` per CNAME auf `joelcode3.github.io`,
  danach Supabase „Site URL“ anpassen) – Betreiber entscheidet noch.
- **Weitere Benutzer** – Anleitung gegeben (Supabase: Add user + `insert into public.team`); Rollen mit
  eingeschränkten Rechten wären möglich, falls gewünscht.
- **Wege-Skizze** vom Betreiber für weitere Wege im Lageplan.
- **Fernauslesung**: Strom über MID-Modbus-Zähler + LoRaWAN, Gastanks über Telemetrie (Lieferant fragen) –
  App-Anbindung bauen, sobald Hardware feststeht.
- iPhone: App ging zuletzt nicht auf – Lösungsschritte geschickt, Rückmeldung/Screenshot abwarten.
