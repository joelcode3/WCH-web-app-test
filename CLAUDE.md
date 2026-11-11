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
- Reiter: **Map · Kalender · To-Dos · airbnb · Mieter · Infrastruktur · Einstellungen** (Mieter = Route `#/kartei`, früher „Parzellen“; Einstellungen = Route `#/daten`, früher „Daten“) (Infrastruktur hat Unterreiter
  Strom, Gas, Ablesen, Verbrauch, Auslastung; Kästen/Tanks als kompakte Zeilen zum Aufklappen). Kein Zähler am Reiter To-Dos.
- „airbnb“ immer klein geschrieben.
- Status: Festwohnsitz (#1f4e8c), Freizeitgrundstück (#6fa8dc), Reserviert (#2b6a33),
  Frei – bezugsfertig (#6cbf5a), Frei – zu räumen (#ec8a2c); „wird frei“ = bewohnt mit Auszugstermin (diagonal).
- Objektart nur „Pachtgrundstück“ / „Mietobjekt“ (ohne Zusätze).
- airbnb-Kalender: belegt rot (#c45a5a), frei hellgrün (#e3f2da), geblockt grau. Kopfzeile im airbnb-Fenster:
  belegt (rot) / frei (grün) / geblockt (grau); Anreisetag ab 16 Uhr belegt, Abreisetag bis 11 Uhr belegt.
- Stromwächter kompakt rechts neben dem Foto (Bus: online, Bad: °C + Batterie-Symbol mit Füllstand, Warnung ab 6 °C; Test-SMS im Reiter Einstellungen; „Überwachung läuft nicht“ erst ab 30 Min. ohne Prüfung).
  Solange ein Problem besteht: rote/gelbe Leiste unter der Kopfzeile auf allen Seiten, bei neuem Alarm einmal ein Fenster (`renderAlarms` in app.js).
- airbnb-Unterkünfte auf der Map als Draufsicht in Originalgröße (Londonbus, Glampingzelt,
  Bäckerwagen = Kastenwagen creme/dunkelgrün), drehbar; Reihenfolge Bus 1, Bus 2, Zelt 1, Zelt 2, Bäckerwagen.
- Gastank-Beschriftung ohne vorangestelltes „T“.
- Parzellennummern: Platz 1 = 1.01–1.30 (unten), Platz 2 = 2.01–2.71 (oben, inkl. Reihe über dem Hauptweg).

## Technik
- Statische Web-App (Vanilla JS, Hash-Router), gehostet auf **GitHub Pages**:
  https://joelcode3.github.io/WCH-web-app-test/
- **Supabase** (Login + Datenbank + Speicher „todo-fotos“ + Edge Functions `airbnb-kalender`, `hue-waechter`, `klima`).
  Zugangsdaten in `js/config.js` (nur der öffentliche Publishable Key – **nie** nach dem Secret-/Service-Key fragen).
  Zugriff nur für E-Mails in der Tabelle `team` (RLS über `is_team_member()`).
- Dateien: `js/data.js` (Datenmodell, Store), `js/cloud.js` (Supabase-Sync, nur Änderungen),
  `js/map.js` (Leaflet-Karte), `js/app.js` (alle Ansichten), `js/airbnb.js`, `js/waechter.js`, `js/klima.js`, `js/wetter.js` (Open-Meteo, Hesedorf 53.23/9.32), `js/feiertage.js`, `js/photos.js`, `js/auth.js`.
- **Versionsnummer** `?v=JJJJMMTT-n` an allen CSS/JS-/Plan-Dateien in `index.html` und `js/config.js`
  bei jeder Änderung hochzählen (sonst zeigt der Browser alte Dateien).
- **Datenbank-Änderungen nur additiv**: neues `supabase/update-N.sql` (idempotent, `if not exists`) und
  denselben Inhalt ans Ende von `schema.sql`. Neue Spalten/Tabellen in `cloud.js` als optional behandeln
  (`OPTIONAL_COLS` bzw. `optional: true`), damit die App auch ohne ausgeführtes Update weiterläuft.
  Bisher: update-2 … update-14 (14: Tabelle `klima` für die Heizung; 13: Spalte `parcels.miete` jsonb; 8: Tabelle `asmus_eintraege` für das Spiel; 9: Stromwächter/Hue;
  10: `termine` für den Kalender, `airbnb_belegung` = von der App aufgezeichnete Buchungen, weil airbnb vergangene nicht liefert;
  11: Art `reservierung` + Spalte `anzahl` in `termine`, To-Do-Ziel `termin`, Spalte `todos.kalender`; 12: Kategorie `extern`).
- Mieter-Ansicht (Parzelle): oben Mieter · Grundstück · **Miete**; unten ein Block **Infrastruktur** (Strom + Gas/Gasflaschen + Heizung).
  Miete nur nach Passwort **MONEY** sichtbar (`MoneyLock` in app.js, je Gerät 1 Std. offen, Sperren-Knopf; nur Sichtschutz).
  Standardpreise (`RENT_DEFAULTS` in data.js, je Mieter anpassbar): Jahrespacht 960 €/Jahr bis 160 m², jeder weitere m² 5,50 €/Jahr,
  Nebenkosten 18,75 €/Monat, Dauerbewohner 60 € je Person/Monat, Gastankmiete 36 € (als €/Jahr angenommen). Dazu Zahlungsrhythmus, Kaution,
  Sonstiges/Notiz. Miete kommt per Dauerauftrag (keine Buchhaltung); Häkchen nur für die jährlichen Strom-/Gas-Abrechnungen
  (`miete.abrechnung[Jahr] = {strom, gas}`), zentral in der Mieterliste (entsperrt: Jahr wählen, Filter „offen“).
- Kalender (Reiter, `Kalender` in app.js): eigene Einträge Termin/Längere Arbeit/Abwesenheit mit Orten und Personen,
  dazu Termine und Fristen aus den To-Dos, Wetter 7 Tage (kompakt, ohne Scrollen; Wetter-Symbol auch oben links auf der Map),
  Kalenderwochen, abwählbarer Kalender „Feiertage/Schulferien“ (`js/feiertage.js`: Feiertage aller Länder berechnet,
  Schulferien von openholidaysapi.org), Feiertage in Niedersachsen wie Wochenende ausgegraut, heute dunkelgrün.
  Kategorie „Extern“ (Termine auf dem Platz ohne das Team, update-12). Eigener, abwählbarer Kalender „Reservierungen / VA“ (Art `reservierung`, mit Ort, Anzahl, To-Dos; To-Do-Ziel `termin`, update-11).
  Ausgewählter Tag hat ein Plus (neuer Eintrag an diesem Tag, `data-k-plus`). Alle Kalender unten in der Legende einzeln abwählbar (je Gerät gemerkt). To-Dos mit Termin erscheinen im gewählten Kalender
  (Spalte `todos.kalender`), Deadlines (früher „Fristen“) als eigener Kalender.
  Mehrtägiges (längere Arbeiten, Abwesenheit, Reservierungen) als durchgehendes Band unten im Tagesfeld, Einzeltermine darüber;
  Ferien und Feiertage als Linie ganz unten (Hover: „Ferien (BY)“); feste Spuren je Woche (`weekLanes`), damit nichts verrutscht. Beschriftung nur am Wochen-/Eintragsanfang,
  zwischen den Tagen heller; Feiertage/Ferien nicht in der Terminliste unten.
  Kalender (Legende links→rechts = im Tag oben→unten, airbnb ganz rechts): Termin (rot, inkl. Deadlines), Arbeiten (orange), Reservierung / VA (grün),
  Extern (blau), Abwesenheit (grau), Feiertage/Schulferien (Linien ganz unten), airbnb (Symbole ganz oben). Vergangene Tage ausgegraut wie Nachbarmonat.
  Kalender „airbnb“ (abwählbar): je gebuchter Unterkunft ein rundes Mini-Symbol (Bus/Zelt mit Nummer darin, Bäckerwagen), An-/Abreisetag zählen mit.
  airbnb-Belegung in % zählt nur belegt, nicht geblockt. To-Do-Liste: Status/Löschen direkt per Menü rechts.
- Lageplan: `tools/plan_import.py` erzeugt `assets/platzplan.svg`, `js/plan-data.js`, Luftbild;
  `tools/render_plan.js` rendert `assets/platzplan.png` (Hintergrund). Eingaben: AutoCAD-PDFs (nicht im Repo).
  Danach `tools/parcels_grow.py`: Parzellen etwas größer (Lücke zu Nachbarn ca. 0,6 m, Abstand zu Wegen bleibt).
  Danach `tools/plan_extras.py` (Daten in `tools/plan_extras.json`, nach Skizzen des Betreibers): Wege/Schotter in Wegfarbe
  mit nahtlosen Übergängen, Wald (Bäume fest in der JSON, einzeln löschbar), Teiche, Spielplatz, Seilbahn, Shelter,
  Hundewiese, Terrasse, Gebäude. Dann `node tools/render_plan.js`. Flugzeug (Fokker-100-Bug) ist ein drehbarer Ort
  (Art `flugzeug`, `top: true`). Orte aus dem Plan legt `Store.ensurePlanPlaces()` einmal je Gerät an (feste IDs `o-plan-*`).
  Geänderte Nummern/Umrisse übernimmt die App über „Einstellungen → Neue Nummern/Umrisse übernehmen“ (Zuordnung über die Lage,
  Mieter/Zähler bleiben erhalten). Nie die Daten durch einen leeren Plan ersetzen.
- **Heizung Londonbusse (Klimaanlagen, GEBAUT 11.11.2026)**: Kältebringer KB34 (TCL) in Smart Life, Tuya-Cloud-Projekt
  „Platzverwaltung“ (Central Europe, Dienste IoT Core + Token + Smart Home Basic; IoT-Core-Probezeit muss verlängert werden).
  Geräte: Bus 1 (Wald) `1632020148e72974109f`, Bus 2 (Teich) `5835847824d7ebc9885b`. Werte: switch, mode (hot), temp_set
  (Zehntelgrad, 0,5er), temp_current (ganze Grad, oben am Gerät gemessen – Anzeige „am Gerät“; Fernbedienung hat kein I FEEL;
  Feuchte nicht vorhanden). Funktion `supabase/functions/klima` (stündlich per `klima-zeitplan.sql`, Tuya-Kontingent sparen):
  Automatik Okt–Apr nach airbnb-Kalender: Abreisetag ab 11 Uhr 16 °C, Anreisetag ab 13 Uhr 20 °C, nur einmal je Ereignis
  (Gäste-Einstellungen bleiben). App `js/klima.js`: Kasten „Heizung“ im airbnb-Fenster (an/aus, Soll −/+, Automatik,
  Aktualisieren = Klima + Stromwächter live). Bewusst schlicht: keine Modus-Auswahl (vom Betreiber so gewünscht).
  Stromwächter bleibt bei 5 Minuten (Schutzfunktion, Hue kostenlos).
- `.github/workflows/supabase-wachhalten.yml` ruft alle 3 Tage `ping()` auf (gegen Pausieren im Gratis-Paket).
- Testen: lokal `python3 -m http.server`, Playwright (Chromium vorinstalliert). Ohne Supabase-Daten in
  `config.js` läuft die App im lokalen Testmodus mit Demo-Daten.

## Offene Themen (Stand 22.10.2026) – nur auf Zuruf des Betreibers bauen
- **App-Logo** erledigt (Tanne + Schriftzug aus dem Original, App-Symbol cremeweiße Tanne). Titel unter dem
  Home-Bildschirm-Symbol ist noch „Platzverwaltung“ – ändern, falls der Betreiber einen anderen Namen nennt.
- **Hue-Marderschreck** (Steckdose nach airbnb-Belegung schalten) – vom Betreiber erstmal gestrichen.
- **Stromwächter Londonbusse – GEBAUT (22.10.2026)**: `supabase/functions/hue-waechter` (Hue Remote API,
  OAuth je Bridge, SMS über seven.io), `supabase/update-9.sql` (Tabellen hue_bridges/hue_oauth geheim,
  waechter_status für Team lesbar), `supabase/waechter-zeitplan.sql` (pg_cron alle 5 Min.), `js/waechter.js`
  (Anzeige im airbnb-Fenster, Reiter airbnb, Warnzeichen auf der Map). Erfahrung 03.11.2026: Bridge Bus 2 verlor nachts (ca. 3 Uhr, Router-Neueinwahl/Update?) die Hue-Cloud-Verbindung, vor Ort lief alles → Fernabfrage blind;
  Temperatur bei fehlender Verbindung grau mit „Stand“. Regeln: Bridge > 30 Min. nicht
  erreichbar → SMS (Ausfall ab 22–8 Uhr: erst nach 3 Std., wegen nächtlicher Fehlalarme; Gäste merkten nichts), Temperatur < 6 °C → sofort SMS (Entwarnung ab 8 °C), Batterie ≤ 15 % → SMS + To-Do beim Bus; SMS-Texte locker formuliert (vom Betreiber), Bus mit Standort „LONDONBUS 2 (Teich)“ (ORTSZUSATZ in der Funktion); keine
  separate Warnung für Stromausfall im Bad (vom Betreiber so gewünscht). Einrichtung: SETUP.md.
  Tests der Funktion: Deno mit nachgestellter DB/Hue/SMS (createWaechter(db, env, fetch, now)).
- **Kalender-Reiter GEBAUT (29.10.2026)**. Noch offen: großer Touchscreen (Touch-/Kiosk-Ansicht), ggf. airbnb An-/Abreisen
  und Auszüge/Pachtbeginn im Kalender. Betreiber kauft erst einen Monitor
  (Vorschläge: Samsung Flip Pro WM55B, Optoma N3551K, iiyama TF4339MSC + Mini-PC mit Windows 11 Pro).
  Vor dem Bau klären: nur Team oder auch Gäste (dann Gästeansicht ohne Namen), Ausrichtung, Gerät.
- **Vorschläge 09.11.2026 (offen):** To-Dos je Mitarbeiter mit eigenem Login und Rolle (RLS, nur eigene To-Dos, abhaken) –
  Fragen offen: darf er To-Dos anlegen, Termine sehen? Klimasplit Kältebringer in airbnb steuern (Ist/Soll, Automatik nach
  Belegung) – inzwischen gebaut, siehe Technik.
  Check-in-Infos 24 Std. vorher: nicht über die App (airbnb gibt keine Gastdaten), sondern airbnb „Geplante Nachrichten“.
- **Versions-Check** („Neue Version verfügbar – neu laden“) angeboten, Betreiber hat noch nicht entschieden.
- **Eigene Adresse** (z. B. `platz.waldcamping-hesedorf.de` per CNAME auf `joelcode3.github.io`,
  danach Supabase „Site URL“ anpassen) – Betreiber entscheidet noch.
- **Weitere Benutzer** – Anleitung gegeben (Supabase: Add user + `insert into public.team`); Rollen mit
  eingeschränkten Rechten wären möglich, falls gewünscht.
- **Fernauslesung/Fernschalten Stromkästen**: Strom über MID-Zähler (Modbus/LoRaWAN), Schalten z. B. Shelly
  Pro 4PM (WLAN) oder Komplettsystem (Camping-Strom, Fernauslese.de); Gastanks über Telemetrie (Lieferant
  fragen) – App-Anbindung erst, wenn Hardware feststeht.
