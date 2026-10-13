/*
 * Zentrale Einstellungen der Platzverwaltung.
 *
 * Wenn der echte Lageplan da ist:
 *   1. Datei nach assets/ kopieren (SVG, PNG oder JPG)
 *   2. url, width und height hier anpassen (Pixelmaße des Bildes)
 *   3. metersPerPixel setzen, damit Flächen aus der Karte berechnet werden können
 *   4. In der App unter "Karte → Bearbeiten" Parzellen, Kästen und Tanks einzeichnen
 */
window.APP_CONFIG = {
  map: {
    url: 'assets/platzplan-platzhalter.svg',
    width: 1200,
    height: 800,
    // Maßstab: wie viele Meter entspricht ein Bildpixel? (null = unbekannt)
    metersPerPixel: 0.3,
    isPlaceholder: true,
  },
  units: { strom: 'kWh', gas: 'm³' },
};
