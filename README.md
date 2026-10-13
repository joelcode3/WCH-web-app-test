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
    (Ecken antippen), Umrisse neu zeichnen
- **Kartei** – alle Parzellen mit Suche und Filtern (Status, Versorgung, Objektart, Winterwasser);
  Karteikarte mit Mieter, Objektart (Pachtgrundstück / Mietobjekt), monatlicher Pacht/Miete,
  Winterwasser, Strom, Gas & Heizung, Notizen und Ablesehistorie; Formular zum Bearbeiten
  (beliebig viele Strom-/Gaszähler je Parzelle, Zähler im Kasten oder im Haus) mit Warnung bei
  doppelter Parzellen- oder Zählernummer
- **Status**: Festwohnsitz, Wochenende, Frei (mit Altbestand), Frei
- **Technik** – Stromkästen und Gastanks; pro Kasten alle Zähler verwalten und entweder einer
  Parzelle zuordnen oder als **Betriebsstrom** kennzeichnen (Platzbeleuchtung, Sanitär, Camperstrom …)
- **Zähler**
  - *Ablesen*: Zählerstände je Kasten/Tank eintippen, sofortiger Abgleich mit dem
    letzten Stand, Warnung bei Rückgang (Zählertausch/Tippfehler)
  - *Verbrauch*: letzte zwei Ablesungen je Zähler oder frei wählbarer Zeitraum; Summen getrennt
    nach Parzellen und Betrieb; CSV-Liste (Parzelle, Name, Zählernummer, Zählerschrank,
    letzter Stand + Datum, aktueller Stand + Datum, Differenz)
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

## Echten Lageplan einsetzen

1. Plan als SVG/PNG/JPG nach `assets/` kopieren
2. In `js/config.js` `url`, `width`, `height` (Pixelmaße) und ggf. `metersPerPixel` anpassen,
   `isPlaceholder: false` setzen
3. In der App unter **Daten → Leeren Bestand anlegen** (oder Demo-Parzellen behalten)
4. **Karte → Bearbeiten**: Parzellen einzeichnen, Stromkästen und Gastanks platzieren

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
js/app.js             Ansichten: Karte, Kartei, Technik, Zähler, Daten
assets/               Lageplan (Platzhalter) & Icon
supabase/schema.sql   Datenbankschema inkl. Zugriffsregeln (enthält alle Updates)
supabase/update-2.sql Update für bestehende Datenbanken (neue Felder)
vendor/leaflet/       Leaflet 1.9.4 (BSD-2-Clause)
vendor/supabase/      supabase-js 2.116.0 (MIT)
```
