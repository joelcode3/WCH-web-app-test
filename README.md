# Platzverwaltung Waldcamping Hesedorf

Interne Web-App zur Übersicht über den Campingplatz: interaktive Karte mit allen Parzellen,
Stromkästen und Gastanks, eine Kartei mit Mieter- und Zählerdaten sowie die Erfassung von
Zählerständen inkl. Verbrauchsberechnung für die Nebenkostenabrechnung.

Läuft im Browser am PC und auf dem iPhone (hochkant), ohne Installation.

## Funktionen (Stand: erste Version)

- **Karte** – Lageplan mit nummerierten Parzellen, eingefärbt nach *Status*
  (Festwohnsitz / Wochenende / leer) oder nach *Versorgung* (Gastank, Gasflaschen,
  Elektroheizung, Sonstiges). Stromkästen ⚡ und Gastanks 🔥 als Symbole.
  - Klick auf eine Parzelle → Infofenster mit Mieter, Telefon, Größe, Heizung, Zählern
  - Klick auf einen Stromkasten → alle Zähler in diesem Kasten mit Parzelle, Mieter
    und letztem Stand; die zugehörigen Parzellen werden auf der Karte hervorgehoben
  - Klick auf einen Gastank → alle angeschlossenen Parzellen mit Gaszählern
  - Suche nach Parzellen-Nr., Name oder Zählernummer
  - **Bearbeiten-Modus**: Kästen/Tanks verschieben, neue Parzellen einzeichnen
    (Ecken antippen, rastet auf rechte Winkel ein), Umrisse neu zeichnen,
    Parzellen **teilen** (Trennlinie ziehen) und mit dem Nachbarn **verbinden**
  - Bedienung: Mausrad zoomt, Trackpad mit zwei Fingern verschiebt, Kneifen zoomt
- **Mieter** (früher Kartei) – alle Parzellen mit Suche und Filtern (Status, Versorgung, Objektart, Winterwasser);
  Karteikarte mit Mieter, Objektart (Pachtgrundstück / Mietobjekt), monatlicher Pacht/Miete,
  Winterwasser, Strom, Gas & Heizung, Notizen und Ablesehistorie; Formular zum Bearbeiten
  (beliebig viele Strom-/Gaszähler je Parzelle, Zähler im Kasten oder im Haus) mit Warnung bei
  doppelter Parzellen- oder Zählernummer
- **Status**: Festwohnsitz (dunkelblau), Wochenendparzelle (hellblau), Reserviert (dunkelgrün),
  Frei – bezugsfertig (grün), Frei – noch zu räumen (orange); bewohnt mit Auszugstermin wird
  diagonal zweifarbig mit „frei ab …“ angezeigt
- **Kartei** zusätzlich: Mietbeginn, Parzelle frei ab, Bewohneranzahl, Hunde
- **Sicherungen**: je Stromzähler beliebig viele Sicherungen (Nummer + Bezeichnung); jede Nummer
  darf pro Stromkasten nur einmal vorkommen (Warnung), auf dem Platz insgesamt mehrfach
- **Karte**: zuschaltbare Symbole (WW Winterwasser, Bewohner und Hunde je nach Anzahl,
  M Mietobjekt, P Pachtgrundstück)
  und Luftbild als Hintergrund
- **To-Dos** – eigener Reiter mit allen Aufgaben: Titel, Beschreibung, Ort (Parzelle, Stromkasten,
  Gastank, Ort auf der Karte oder frei, z. B. „Sanitärgebäude 2“), Status (kein Status / in Planung /
  in Arbeit / erledigt), Deadline, optionaler Termin (z. B. Techniker), Zuständig, Fotos
  (direkt mit der Handykamera), Erstellungs- und Erledigt-Datum. Filter nach Status, Ort und
  Zuständigkeit; überfällige zuerst. In jedem Infofenster der Karte „+ To-Do“; offene To-Dos
  werden auf der Karte markiert, der Reiter zeigt die Anzahl (rot bei Überfälligem)
- **Orte** – Sanitärgebäude, Grillhütte, Spielplatz, Rezeption … als Symbole auf der Karte
  (Bearbeiten-Modus → „+ Ort“), jeweils mit eigenen To-Dos
- **Airbnb** – Ferienunterkünfte (Londonbus, Glampingzelt, Bäckerwagen …) als gezeichnete Draufsicht
  in Originalgröße auf der Karte (im Bearbeiten-Modus verschieb- und drehbar), Punkt = heute belegt
  (grün) / frei (weiß) / geblockt (grau). Infofenster mit Foto, Monatskalender, Link zum Inserat und To-Dos. Reiter „Airbnb“: alle Unterkünfte mit Belegung der
  nächsten 9 Wochen. Belegung live aus den Airbnb-Kalendern (Supabase-Funktion `airbnb-kalender`)
- **Infrastruktur** (früher Technik, mit Unterreitern Ablesen / Verbrauch / Auslastung) – Stromkästen und Gastanks; pro Kasten alle Zähler verwalten und entweder einer
  Parzelle zuordnen oder als **Betriebsstrom** kennzeichnen (Platzbeleuchtung, Sanitär, Camperstrom …)
- **Zähler**
  - *Ablesen*: Zählerstände je Kasten/Tank eintippen, sofortiger Abgleich mit dem
    letzten Stand, Warnung bei Rückgang (Zählertausch/Tippfehler)
  - *Verbrauch*: letzte zwei Ablesungen je Zähler oder frei wählbarer Zeitraum; Summen getrennt
    nach Parzellen und Betrieb; CSV-Liste (Parzelle, Name, Zählernummer, Zählerschrank,
    letzter Stand + Datum, aktueller Stand + Datum, Differenz)
  - *Auslastung*: Ø Verbrauch pro Monat je Stromkasten und je Parzelle, optionale Warnschwelle
    pro Kasten (Hinweis bei > 80 % bzw. Überschreitung)
- **Daten** – Sicherung als JSON exportieren/importieren, Kartei als CSV,
  Demo-Daten oder leerer Bestand

## Starten

Es ist keine Installation nötig – es sind reine statische Dateien.

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Alternativ kann der Ordner auf einen beliebigen Webspace gelegt werden, z. B. GitHub Pages
(siehe [SETUP.md](SETUP.md), Schritt 7). Auf dem iPhone in Safari über
„Teilen → Zum Home-Bildschirm“ wie eine App ablegen.

## Lageplan

Grundlage ist der AutoCAD-Plan (Luftbild + Linien: rot Grundstück, blau Wege, grün Gebäude,
orange Parzellen). `tools/plan_import.py` erzeugt daraus die Kartengrundlage:

- `assets/platzplan.svg` – gezeichneter Plan im App-Stil (Wald, Wiese, graue Wege, Gebäude)
- `assets/luftbild.jpg` – passend zugeschnittenes Luftbild (in der Legende zuschaltbar)
- `js/plan-data.js` – vereinfachte Parzellenumrisse mit Lücken, Nummern 1.01… (unterer Platz)
  und 2.01… (oberer Platz), Wegflächen werden ausgespart

Bei einem geänderten Plan:

```bash
pdftocairo -svg Platzplan_2.pdf plan2.svg      # Linien ohne Hintergrund
pdfimages -j Platzplan_4.pdf luft              # Luftbild → luft-000.jpg
pip install shapely pillow
python3 tools/plan_import.py --lines plan2.svg --aerial luft-000.jpg
```

Korrekturen gegenüber dem CAD-Plan (zusätzliche, geteilte Parzellen) stehen in `EDITS` in
`tools/plan_import.py`. Die Nummerierung erfolgt blockweise (aneinandergrenzende Parzellen).

**Neue Version veröffentlichen:** In `index.html` und `js/config.js` die Versionsnummer `?v=…` hochzählen,
damit Browser die neuen Dateien sofort laden (GitHub Pages lässt sie sonst bis zu 10 Minuten zwischenspeichern).

In der App übernimmt **Daten → Parzellen aus Lageplan übernehmen** die Parzellen (leer, ohne
Mieter). Einzelne Parzellen lassen sich jederzeit unter **Karte → Bearbeiten** neu einzeichnen,
neue Parzellen anlegen und Nummern in der Kartei ändern.

## Datenbank & Login

Die App arbeitet mit **Supabase** (gehostete Postgres-Datenbank mit Login, Region Frankfurt):

- Anmeldung mit E-Mail und Passwort, „Passwort vergessen“, Einladung per E-Mail
- Zugriff nur für freigeschaltete E-Mail-Adressen (Tabelle `team`, Row Level Security)
- Alle Geräte (PC, iPhone, mehrere Personen) sehen denselben Stand;
  beim Zurückkehren in die App wird automatisch aktualisiert
- Änderungen werden sofort gespeichert (Anzeige oben rechts: Gespeichert / Speichert … /
  Nicht gespeichert – antippen zum erneuten Versuch)

**Einrichtung:** siehe [SETUP.md](SETUP.md). Ohne Supabase-Zugangsdaten in `js/config.js`
läuft die App im **lokalen Testmodus** (keine Anmeldung, Daten nur im Browser, Demo-Daten).

## Aufbau

```
index.html            Grundgerüst, Navigation
css/style.css         Gestaltung (Farben/Schriften oben als Variablen)
js/config.js          Lageplan, Einheiten, Supabase-Zugang
js/data.js            Datenmodell, Speicherung, Demo-Daten
js/cloud.js           Supabase: Laden, Speichern (nur Änderungen), Login
js/auth.js            Anmeldebildschirm
js/map.js             Interaktive Karte (Leaflet)
js/photos.js          Fotos zu To-Dos (verkleinern, Supabase-Speicher „todo-fotos“)
js/airbnb.js          Ferienunterkünfte: Draufsichten, Belegung, Kalender
js/app.js             Ansichten: Karte, Kartei, Technik, Zähler, Daten
assets/               Lageplan (Platzhalter) & Icon
supabase/schema.sql   Datenbankschema inkl. Zugriffsregeln (enthält alle Updates)
supabase/update-2.sql Update für bestehende Datenbanken (neue Felder)
supabase/update-3.sql Update: Reserviert, Hunde, Mietbeginn, frei ab, Warnschwelle
supabase/update-4.sql Update: Bewohneranzahl
supabase/update-5.sql Update: To-Dos mit Fotos, Orte auf der Karte
supabase/update-6.sql Update: Sicherungen je Stromzähler, Wachhalter-Funktion ping()
supabase/update-7.sql Update: Ferienunterkünfte (Kalender-Link, Foto)
supabase/functions/airbnb-kalender/  Supabase-Funktion: holt die Airbnb-Kalender (nur Daten, keine Gäste)
.github/workflows/supabase-wachhalten.yml  fragt alle 3 Tage bei Supabase an (gegen Pausieren)
tools/plan_import.py  Umwandlung AutoCAD-Plan → Kartengrundlage
js/plan-data.js       Parzellenumrisse aus dem Lageplan (erzeugt)
vendor/leaflet/       Leaflet 1.9.4 (BSD-2-Clause)
vendor/supabase/      supabase-js 2.116.0 (MIT)
vendor/polygon-clipping/ polygon-clipping 0.15.7 (MIT) – Teilen/Verbinden von Parzellen
```
