/*
 * Zentrale Einstellungen der Platzverwaltung.
 *
 * Neuer/geänderter Lageplan: tools/plan_import.py ausführen (erzeugt assets/platzplan.svg,
 * assets/luftbild.jpg und js/plan-data.js). Parzellen lassen sich danach jederzeit in der
 * App unter "Karte → Bearbeiten" anpassen oder neu einzeichnen.
 */
window.APP_CONFIG = {
  map: {
    // Erzeugt mit tools/plan_import.py aus dem AutoCAD-Lageplan (siehe README)
    url: 'assets/platzplan.png?v=20261016-14',  // gerendert aus platzplan.svg (tools/render_plan.js)
    aerial: 'assets/luftbild.jpg?v=20261016-14',
    width: (window.PLAN_DATA && window.PLAN_DATA.width) || 1755,
    height: (window.PLAN_DATA && window.PLAN_DATA.height) || 1765,
    // Maßstab: wie viele Meter entspricht ein Kartenpixel?
    metersPerPixel: (window.PLAN_DATA && window.PLAN_DATA.metersPerPixel) || 0.2,
    isPlaceholder: false,
  },
  units: { strom: 'kWh', gas: 'm³' },

  /*
   * Datenbank & Login (Supabase). Werte stehen im Supabase-Dashboard unter
   * "Project Settings → API Keys" bzw. "Connect": Project URL und der
   * "Publishable key" (ältere Projekte: "anon public" Key).
   * Der anon-Key ist öffentlich unbedenklich – geschützt wird über Login + Zugriffsregeln.
   * Leer lassen = lokaler Testmodus ohne Login (Daten nur im Browser).
   */
  supabase: {
    url: 'https://erobbkjhfauwvzfegeiw.supabase.co',
    anonKey: 'sb_publishable_NQ2Q9efPtjrLHr6pEB4ygg_vE4Vnp-S',
  },
};
