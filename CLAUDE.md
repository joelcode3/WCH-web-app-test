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
- Status (blasse Pastellfarben, Variante B vom 25.11.2026, weiße Nummern mit Schatten): Festwohnsitz (#7995ba), Freizeitgrundstück (#a9cbea), Reserviert (#80a685),
  Frei – bezugsfertig (#a7d99c), Frei – zu räumen (#f4b980) (früher kräftiger: #1f4e8c, #6fa8dc, #2b6a33, #6cbf5a, #ec8a2c); „wird frei“ = bewohnt mit Auszugstermin (diagonal).
- Objektart nur „Pachtgrundstück“ / „Mietobjekt“ (ohne Zusätze).
- airbnb-Kalender: belegt rot (#c45a5a), frei hellgrün (#e3f2da), geblockt grau. Kopfzeile im airbnb-Fenster:
  belegt (rot) / frei (grün) / geblockt (grau); Anreisetag ab 16 Uhr belegt, Abreisetag bis 11 Uhr belegt (beide halb, diagonal); Wechseltag (Abreise + Anreise am selben Tag) mit heller Lücke in der Mitte (`d-swap`), nur wenn beide Seiten gleiche Farbe haben (belegt↔geblockt nur Diagonale).
- Stromwächter kompakt rechts neben dem Foto (Bus: online, Bad: °C + Batterie-Symbol mit Füllstand, Warnung bei unter 6 °C; Test-SMS im Reiter Einstellungen; „Überwachung läuft nicht“ erst ab 30 Min. ohne Prüfung).
  Solange ein Problem besteht: rote/gelbe Leiste unter der Kopfzeile auf allen Seiten, bei neuem Alarm einmal ein Fenster (`renderAlarms` in app.js).
- airbnb-Unterkünfte auf der Map als Draufsicht in Originalgröße (Londonbus, Glampingzelt,
  Bäckerwagen = Kastenwagen creme/dunkelgrün), drehbar; Reihenfolge Bus 1, Bus 2, Zelt 1, Zelt 2, Bäckerwagen.
- Gastank-Beschriftung ohne vorangestelltes „T“.
- Namen (26.11.2026): Wasserschächte „W-01“ … (früher „2-01“, Umbenennung +1 über Einstellungen), Stromkästen „S-01“ … (früher „1-01“);
  Absperrhähne mit Kennbuchstabe je Schacht (`kz`: A, B, C …) → Anzeige „Absperrhahn W-08/A“ (`Store.hahnCode/hahnLabel`), Bezeichnung freiwillig;
  Absperrhahn-Symbol nach Vorlage des Betreibers als Linien (Rohr, runder Ventilkörper, T-Griff; `WICO.valve`, Variante V3): steht vor der Überschrift „Absperrhähne“ (Zähler-Symbol vor „Wasserzähler“) und im Hover-Feld; im Schacht-Fenster Schildchen nur „A“ (türkis) bzw. „Z3“ (blaugrau) ohne Symbol; im Foto runde Markierungen. Alle Kennzeichen (A, B, Z1, Z12 …) immer als echte Kreise, längere Texte mit kleinerer Schrift (`is-long`).
  Wasserzähler platzweit fortlaufend nummeriert (`znr`, Z1, Z2 … über alle Schächte, fest; `Store.nextZnr`).
  Zähler im Stromkasten werden als „S-06/55“ angezeigt (`Store.meterCode`), gespeichert bleibt nur die echte Zählernummer.
  In Listen heißen Schächte „Wasserschacht W-01“ (`Store.placeLabel`). Einmal-Umbenennung: `Store.renamePlan/applyRename`, Karte in Einstellungen mit Vorschau.
- Stromkasten-Fenster (26.11.2026, Variante A): Zähler nach Parzelle gruppiert (Karte: Parzellennummer + Mieter, „· 2 Zähler“), darunter je Zähler
  „S-01/50“ fett mit orangem Zähler-Symbol, Sicherung grau mit Sicherungs-Symbol dahinter, letzte 3 Stände mit Verbrauch; Stand bei der letzten Ablesung
  unverändert → Zähler ausgegraut mit „inaktiv“ (keine Zähler-Anzahl im Kopf). Parzellen-Fenster (Map) zeigt die Zähler genauso (`parcelMeters`: Stromzähler orange, Gaszähler grün).
  Unverändert → Zähler ausgegraut mit „inaktiv“ (`boxMeterGroups/boxMeterItem`, Symbole `BICO`). Schacht-Fenster-Kopf wie beim Stromkasten: Schildchen (Tropfen + Name) + „Wasserschacht W-08“.
- Map-Schildchen einheitlich mit weißem Rand: Stromkasten gelb, Gastank grün, Wasserschacht kräftiges Türkis (#7fd3db) mit dunkler Schrift.
- Suche (Map): Parzellen, Stromkästen (gelb), Gastanks (grün, mit Parzellen), Wasserschächte (türkis, auch nach Hahn-/Zählernummer), Orte; ohne Groß-/Kleinschreibung.
- Satellitenbild an: Parzellen ohne Füllung, nur weiße Umrandung (gewählte gelb), keine Statusfarben.
- Parzellen immer unterste Ebene (eigene `parcelPane`, z-index 300) – darf nichts verdecken (Safari zeichnete sonst Parzellen über Tanks).
- Parzellennummern: Platz 1 = 1.01–1.30 (unten), Platz 2 = 2.01–2.71 (oben, inkl. Reihe über dem Hauptweg).

## Technik
- Statische Web-App (Vanilla JS, Hash-Router), gehostet auf **GitHub Pages**:
  https://joelcode3.github.io/WCH-web-app-test/
- **Supabase** (Login + Datenbank + Speicher „todo-fotos“ + Edge Functions `airbnb-kalender`, `hue-waechter`, `klima`, `ms-todo`).
  Zugangsdaten in `js/config.js` (nur der öffentliche Publishable Key – **nie** nach dem Secret-/Service-Key fragen).
  Zugriff nur für E-Mails in der Tabelle `team` (RLS über `is_team_member()`).
- Dateien: `js/data.js` (Datenmodell, Store), `js/cloud.js` (Supabase-Sync, nur Änderungen),
  `js/map.js` (Leaflet-Karte), `js/app.js` (alle Ansichten), `js/airbnb.js`, `js/waechter.js`, `js/klima.js`, `js/mstodo.js`, `js/wetter.js` (Open-Meteo, Hesedorf 53.23/9.32), `js/feiertage.js`, `js/photos.js`, `js/auth.js`.
- **Versionsnummer** `?v=JJJJMMTT-n` an allen CSS/JS-/Plan-Dateien in `index.html` und `js/config.js`
  bei jeder Änderung hochzählen (sonst zeigt der Browser alte Dateien).
- **Datenbank-Änderungen nur additiv**: neues `supabase/update-N.sql` (idempotent, `if not exists`) und
  denselben Inhalt ans Ende von `schema.sql`. Neue Spalten/Tabellen in `cloud.js` als optional behandeln
  (`OPTIONAL_COLS` bzw. `optional: true`), damit die App auch ohne ausgeführtes Update weiterläuft.
  Bisher: update-2 … update-16 (16: Spalte `places.wasser` jsonb für Wasserschächte; 15: Microsoft To Do – ms_todo_konto/oauth/aufgaben geheim, ms_todo_status lesbar; 14: Tabelle `klima` für die Heizung; 13: Spalte `parcels.miete` jsonb; 8: Tabelle `asmus_eintraege` für das Spiel; 9: Stromwächter/Hue;
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
  Automatik Okt–Apr nach airbnb-Kalender: Abreisetag ab 11 Uhr 16 °C, Anreisetag ab 15 Uhr 22 °C, nur einmal je Ereignis
  (Gäste-Einstellungen bleiben; geblockte Tage sind keine Gäste). Schalten in der App fragt nach, wenn der Bus gerade belegt/geblockt ist. App `js/klima.js`: Kasten „Heizung“ im airbnb-Fenster (an/aus, Soll −/+, Automatik,
  Aktualisieren = Klima + Stromwächter live). Bewusst schlicht: keine Modus-Auswahl (vom Betreiber so gewünscht).
  Stromwächter bleibt bei 5 Minuten (Schutzfunktion, Hue kostenlos).
- **Microsoft To Do (GEBAUT 11.11.2026)**: Kollege nutzt weiter To Do (privates Konto, eine Liste). Funktion `supabase/functions/ms-todo`
  (Graph API, OAuth „consumers“, Scope Tasks.ReadWrite, alle 15 Min. per `ms-todo-zeitplan.sql`): nur Titel mit „Camping“ am Anfang
  (Wort fällt weg), To-Do-ID `ms-…`, Badge „To Do“ in der Liste. To Do → App: neu, Titel/Notiz/Fälligkeit, erledigt/wieder offen.
  App → To Do: nur „erledigt“ (abhaken). Zuständigkeit/Ort wird in der App geklärt. In der App gelöschte kommen nicht wieder.
  Verbinden/Abgleichen/Trennen im Reiter Einstellungen (`js/mstodo.js`). Client Secret läuft nach 24 Monaten ab.
- **Wasser (GEBAUT 19.11.2026, umgebaut 24.11.)**: Ort-Art `schacht` (Wasserschacht, Symbol ausgefüllter Tropfen, eigene Ebene „Wasser“ in der Legende, `Wasser` in app.js),
  Daten in `place.wasser` = { haehne:[{id,name,info,area (Eckpunkte in Map-Pixeln), foto [x%,y%], sommerwasser, zu (Datum abgedreht oder '')}],
  zaehler:[{id,nr,foto,ablesungen[{datum,stand}]}] (mehrere je Schacht, auf dem Foto als Kästchen „Z1“), abstellInfo }.
  Im Schacht-Fenster je Hahn Häkchen „zu“; bei Frost in der Vorhersage und offenem Sommerwasser-Hahn rotes „!“ (Hahn, Schacht-Symbol auf der Map) und gelbe Warnleiste oben (`renderAlarms`, zusammen mit den Stromwächter-Alarmen). Kein Sommerwasser-Textblock im Schacht-Fenster. Klick auf den Schacht zeigt die Bereiche der Hähne türkis, beschriftet nur mit dem Hahn-Namen (keine eigenen Nummern),
  Klick auf einen Hahn hebt ihn hervor. Bereiche: Ecken antippen, rechtwinklige Kanten (`startDraw` mit `ortho`), Ecken beim Anzeigen leicht abgerundet (`roundCorners`).
  Überfahren des Schachts (Maus) zeigt „Wasserschacht <Name>“, Hähne + Zählernummer (hellblaues Feld, fett). Foto mit kleinen Nummern-Kreisen (gewählt: hellblauer Ring). Schacht-Fenster zeigt nur Infos; Bearbeiten (Hahn-Menü, Foto, Zähler ändern, + Absperrhahn) erst nach Knopf „Bearbeiten“ (`Wasser.editing`). Legende „Sonne = Sommerwasser“ nur unten im Schacht-Fenster (nicht im Hover-Feld).
  Schachtnamen eindeutig (Warnung beim Tippen, Speichern gesperrt, `Wasser.nameTaken`). Sommerwasser je Absperrhahn (Symbol Sonne mit Tropfen, Hinweis „Sommerwasser“); Schacht zählt, wenn ein Hahn Sommerwasser ist (`Store.hatSommerwasser`).
  Reiter Infrastruktur → Wasser (`#/technik/wasser`) mit Sommerwasser-Checkliste je Winter (Saison ab 1. Juli). Erinnerung: sobald die 7-Tage-Vorhersage Frost (Tiefstwert ≤ 0 °C)
  zeigt, einmal je Winter To-Do `sw-JAHR` „Sommerwasser abstellen“ (fällig am Frosttag); erledigt, wenn alle abgehakt.
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
  erreichbar → SMS (Ausfall ab 22–8 Uhr: erst nach 3 Std., wegen nächtlicher Fehlalarme; Gäste merkten nichts), Temperatur < 6 °C → sofort SMS (Entwarnung ab 8 °C), Batterie ≤ 15 % → SMS + To-Do beim Bus; Hue-Antwort HTTP 521/522/523 = Bridge nicht mit der Hue-Cloud verbunden (= nicht erreichbar; Erfahrung 17.–20.11.2026, vorher als „Hue gestört“ still übergangen); sonstige unklare Antworten länger als 2 Std.: läuft eine andere Bridge → gilt als nicht erreichbar, sonst SMS „Überwachung blind“ nur an SMS_ADMIN; App zeigt „keine Daten seit …“ ab 1 Std. ohne Antwort; SMS-Texte locker formuliert (vom Betreiber); Technik-Hinweise (Batterie, Hue-/Tuya-Zugang) nur an Secret `SMS_ADMIN` (Betreiber), Stromausfall/Frost an alle (`SMS_EMPFAENGER`), Bus mit Standort „LONDONBUS 2 (Teich)“ (ORTSZUSATZ in der Funktion); keine
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
