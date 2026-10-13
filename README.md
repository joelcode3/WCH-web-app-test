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
- **Kartei** – alle Parzellen mit Suche und Filtern; Karteikarte mit Mieter, Grundstück,
  Strom, Gas & Heizung, Notizen und Ablesehistorie; Formular zum Bearbeiten
  (beliebig viele Strom-/Gaszähler je Parzelle)
- **Technik** – Übersicht und Pflege der Stromkästen und Gastanks
- **Zähler**
  - *Ablesen*: Zählerstände je Kasten/Tank eintippen, sofortiger Abgleich mit dem
    letzten Stand, Warnung bei Rückgang (Zählertausch/Tippfehler)
  - *Verbrauch*: Verbrauch zwischen zwei Ablesungen je Zähler, Summe, CSV-Export (Excel)
- **Daten** – Sicherung als JSON exportieren/importieren, Kartei als CSV,
  Demo-Daten oder leerer Bestand

## Starten

Es ist keine Installation nötig – es sind reine statische Dateien.

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Alternativ kann `index.html` direkt geöffnet oder der Ordner auf einen beliebigen
Webspace (z. B. GitHub Pages) gelegt werden. Auf dem iPhone in Safari über
„Teilen → Zum Home-Bildschirm“ wie eine App ablegen.

## Echten Lageplan einsetzen

1. Plan als SVG/PNG/JPG nach `assets/` kopieren
2. In `js/config.js` `url`, `width`, `height` (Pixelmaße) und ggf. `metersPerPixel` anpassen,
   `isPlaceholder: false` setzen
3. In der App unter **Daten → Leeren Bestand anlegen** (oder Demo-Parzellen behalten)
4. **Karte → Bearbeiten**: Parzellen einzeichnen, Stromkästen und Gastanks platzieren

## Wichtig: Datenspeicherung

Die Daten liegen aktuell im **lokalen Speicher des jeweiligen Browsers**. PC und iPhone
haben daher getrennte Bestände – Austausch über Export/Import. Die enthaltenen Demo-Daten
(Namen, Nummern, Stände) sind frei erfunden.

Nächster sinnvoller Schritt: zentrale Datenbank mit Login, damit alle Geräte denselben
Stand sehen und die personenbezogenen Mieterdaten geschützt sind.

## Aufbau

```
index.html            Grundgerüst, Navigation
css/style.css         Gestaltung (Farben/Schriften oben als Variablen)
js/config.js          Lageplan & Einheiten
js/data.js            Datenmodell, Speicherung, Demo-Daten
js/map.js             Interaktive Karte (Leaflet)
js/app.js             Ansichten: Karte, Kartei, Technik, Zähler, Daten
assets/               Lageplan (Platzhalter) & Icon
vendor/leaflet/       Leaflet 1.9.4 (BSD-2-Clause)
```
