# Einrichtung: Datenbank & Login (Supabase) und Veröffentlichung (GitHub Pages)

Dauer: ca. 20 Minuten. Es fallen keine Kosten an (kostenloser Tarif von Supabase und GitHub).

Solange die Schritte 1–6 nicht erledigt sind, läuft die App im **lokalen Testmodus**
(keine Anmeldung, Daten nur im jeweiligen Browser).

---

## 1. Supabase-Projekt anlegen

1. Auf <https://supabase.com> registrieren und **„New project“** wählen.
2. Name z. B. `platzverwaltung`, **Region: „Central EU (Frankfurt)“** (Daten bleiben in Deutschland).
3. Ein Datenbank-Passwort vergeben und sicher aufbewahren (wird von der App nicht benötigt).
4. Warten, bis das Projekt bereit ist (1–2 Minuten).

## 2. Tabellen anlegen

1. Im Projekt links **„SQL Editor“** öffnen → **„New query“**.
2. Den kompletten Inhalt der Datei [`supabase/schema.sql`](supabase/schema.sql) einfügen → **„Run“**.
3. Eine neue Abfrage öffnen und die eigene E-Mail-Adresse freischalten:

   ```sql
   insert into public.team (email, name) values ('deine@email.de', 'Dein Name');
   ```

Nur E-Mail-Adressen in der Tabelle `team` können Daten sehen oder ändern – auch wenn
sich jemand anderes einen Zugang verschaffen sollte.

## 3. Selbst-Registrierung abschalten

**Authentication → Sign In / Providers** (bzw. „Providers → Email“):
**„Allow new users to sign up“ ausschalten.** Benutzer werden ausschließlich eingeladen.

## 4. Adresse der App hinterlegen

**Authentication → URL Configuration:**

- **Site URL:** `https://joelcode3.github.io/WCH-web-app-test/`
- **Redirect URLs:** dieselbe Adresse hinzufügen (optional zusätzlich `http://localhost:8000` zum lokalen Testen)

Wichtig für die Links in Einladungs- und „Passwort vergessen“-Mails.

## 5. Benutzer einladen

1. **Authentication → Users → „Add user“ → „Send invitation“**, E-Mail-Adresse eingeben.
2. Die Person zusätzlich in die Tabelle `team` eintragen (**Table Editor → team → Insert row**
   oder per SQL wie in Schritt 2).
3. Die Person bekommt eine E-Mail, klickt den Link und legt in der App ihr Passwort fest.

Für dich selbst genauso – oder unter „Add user“ → „Create new user“ direkt ein Passwort
vergeben (Haken bei „Auto Confirm User“ setzen).

### Spätere Datenbank-Updates

Wenn neue Felder dazukommen, liegt im Ordner `supabase/` ein Update-Skript (z. B. `update-2.sql`).
Es wird genauso wie oben im **SQL Editor** eingefügt und mit **Run** ausgeführt. Die Skripte
lassen sich gefahrlos mehrfach ausführen. Wer neu einrichtet, braucht nur `schema.sql`
(enthält alle Updates).

`update-5.sql` (To-Dos & Orte) legt zusätzlich den privaten Foto-Speicher **todo-fotos** an –
unter „Storage“ muss dafür nichts von Hand eingerichtet werden.

### Airbnb-Kalender einrichten (Ferienunterkünfte)

Die App zeigt die Belegung der Unterkünfte live aus den Airbnb-Kalendern. Weil der Browser Airbnb
nicht direkt abfragen darf, holt eine kleine Supabase-Funktion die Kalender ab (einmal einrichten):

1. `supabase/update-7.sql` im **SQL Editor** ausführen (falls noch nicht geschehen).
2. Im Supabase-Dashboard links **Edge Functions** → **Deploy a new function** → **Via Editor**.
3. Als Namen genau `airbnb-kalender` eintragen.
4. Den vorhandenen Beispieltext löschen und den kompletten Inhalt von
   `supabase/functions/airbnb-kalender/index.ts` einfügen → **Deploy function**.
5. Bei der Funktion unter **Details** den Schalter **Verify JWT** ausschalten und speichern.
   Das ist unbedenklich: Die Funktion liest die Unterkünfte mit dem Login der App, ohne Login
   und ohne Team-Eintrag gibt sie nichts heraus.

Die Kalender-Links (Airbnb → Inserat → Verfügbarkeit → Kalender verbinden → **Kalender exportieren**)
trägt man in der App ein: Karte → Unterkunft antippen → **Bearbeiten** → „Airbnb-Kalender-Link“.
Sie stehen nur in der geschützten Datenbank, nicht im öffentlichen GitHub-Projekt.

### Stromausfall- und Frostwarnung (Londonbusse, Hue Bridge, SMS)

Die Supabase-Funktion `hue-waechter` prüft alle 5 Minuten jede verbundene Hue Bridge:
ist sie länger als 15 Minuten nicht erreichbar (möglicher Stromausfall), fällt ein
Hue-Bewegungsmelder 10 Minuten lang unter 5 °C (Frostgefahr) oder wird eine Melder-Batterie
schwach, kommt eine SMS – und eine Entwarnung, sobald alles wieder in Ordnung ist.
In der App steht der Zustand beim Bus (Map → Bus antippen) und im Reiter **airbnb**.

Einmal einrichten (ca. 45 Minuten):

1. **Datenbank:** `supabase/update-9.sql` im **SQL Editor** ausführen.
2. **SMS-Dienst (seven.io):** auf seven.io ein Konto anlegen, Guthaben aufladen (z. B. 10 €),
   dann unter **Developer → API Keys** einen Schlüssel erzeugen und kopieren.
3. **Hue-Entwicklerzugang:** auf developers.meethue.com anmelden (kostenlos registrieren),
   oben **Remote Hue API appids** → **Add new Remote Hue API appid**:
   - App name: `Platzverwaltung Waldcamping`
   - Callback URL: `https://erobbkjhfauwvzfegeiw.supabase.co/functions/v1/hue-waechter`
   - Application description: `Stromausfall- und Frostwarnung`
   → **Submit**. Angezeigt werden **ClientId** und **ClientSecret** – gleich gebraucht.
4. **Funktion anlegen:** Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**,
   Name genau `hue-waechter`, Beispieltext löschen, kompletten Inhalt von
   `supabase/functions/hue-waechter/index.ts` einfügen → **Deploy function**.
   Danach bei der Funktion unter **Details** den Schalter **Verify JWT** ausschalten und speichern
   (die Hue-Anmeldung springt ohne Login zur Funktion zurück; alle Knöpfe prüfen selbst das Team-Login).
5. **Geheime Einstellungen:** Supabase → **Edge Functions** → **Secrets** → je **Add new secret**:
   - `HUE_CLIENT_ID` = ClientId aus Schritt 3
   - `HUE_CLIENT_SECRET` = ClientSecret aus Schritt 3
   - `SEVEN_API_KEY` = Schlüssel aus Schritt 2
   - `SMS_EMPFAENGER` = Handynummern, mit Komma getrennt, z. B. `0171 1234567, 0160 7654321`
   - optional `SMS_ABSENDER` = Absendername (max. 11 Zeichen, Standard `WCHesedorf`)
   Diese Werte stehen nur bei Supabase, nicht im öffentlichen GitHub-Projekt.
6. **5-Minuten-Takt:** `supabase/waechter-zeitplan.sql` im **SQL Editor** ausführen.
7. **Busse verbinden:** In der App Map → Londonbus 1 antippen → **Mit Hue verbinden** → mit dem
   Hue-Konto anmelden, bei mehreren Bridges **die Bridge von Bus 1** wählen, erlauben → die App
   meldet „Hue verbunden“. Dasselbe für Londonbus 2 (dort die andere Bridge wählen).
8. **Test-SMS** im selben Fenster antippen – die SMS sollte in wenigen Sekunden ankommen.

Temperatur: Hue-Bewegungsmelder (innen) ganz normal in der Hue-App an der Bridge des Busses
anmelden und sinnvoll benennen (z. B. „Bad Bus 1“). Er erscheint dann automatisch beim Bus.
Im kalten Bus Lithium-AAA-Batterien verwenden.

### Pausieren verhindern (kostenloses Supabase-Paket)

Supabase pausiert kostenlose Projekte nach 7 Tagen ohne Nutzung. Die GitHub-Aufgabe
`.github/workflows/supabase-wachhalten.yml` fragt deshalb alle 3 Tage kurz bei der Datenbank an
(ohne Daten zu lesen). Läuft automatisch; unter GitHub → **Actions** sieht man die Durchläufe.
Hinweis: GitHub stoppt geplante Aufgaben, wenn im Repository 60 Tage lang nichts passiert
(GitHub schickt vorher eine E-Mail) – dann unter Actions einmal „Enable workflow“ klicken.

## 6. Zugangsdaten in die App eintragen

**Project Settings → API Keys** (oder oben der Button **„Connect“**):

- **Project URL** (z. B. `https://abcdefgh.supabase.co`)
- **Publishable key** (ältere Projekte: **„anon public“**)

Beide Werte in [`js/config.js`](js/config.js) unter `supabase` eintragen – oder einfach an
Claude schicken, dann wird es erledigt. Diese beiden Werte dürfen öffentlich sein;
**niemals** den `service_role`/„secret“-Key verwenden!

```js
supabase: {
  url: 'https://abcdefgh.supabase.co',
  anonKey: 'sb_publishable_…',
},
```

Ab jetzt erscheint beim Öffnen der App die Anmeldung, und alle Geräte arbeiten mit
demselben Datenbestand. Die leere Datenbank kann unter **Daten → Sicherung importieren**
(z. B. mit einer Sicherung aus dem Testmodus) oder **Daten → Demo-Daten laden** befüllt werden.

## 7. GitHub Pages einschalten

1. Im Repository **Settings → Pages**.
2. **Source:** „Deploy from a branch“.
3. **Branch:** den Branch mit der App wählen (aktuell `claude/wonderful-mendel-xsvwgh`,
   nach dem Zusammenführen `main`), Ordner **`/ (root)`** → **Save**.
4. Nach 1–2 Minuten ist die App erreichbar unter
   <https://joelcode3.github.io/WCH-web-app-test/>.

Auf dem iPhone in Safari öffnen → **Teilen → „Zum Home-Bildschirm“** – dann startet sie wie eine App.

---

## Gut zu wissen

- **Pausierung im Gratis-Tarif:** Supabase pausiert kostenlose Projekte nach ca. 7 Tagen
  ohne Nutzung. Im Dashboard lässt sich das Projekt mit einem Klick wieder starten.
  Bei regelmäßiger Nutzung passiert das nicht.
- **Datensicherung:** Der Gratis-Tarif enthält keine herunterladbaren Backups.
  Deshalb regelmäßig in der App **Daten → Sicherung exportieren** (z. B. nach jeder Ablesung).
- **E-Mails:** Der eingebaute Mailversand von Supabase ist auf wenige Mails pro Stunde begrenzt –
  für ein kleines Team ausreichend. Für eigene Absenderadresse: Authentication → Emails → SMTP.
- **Datenschutz:** Mieterdaten sind personenbezogen. Supabase bietet einen
  Auftragsverarbeitungsvertrag (DPA) an; mit Region Frankfurt liegen die Daten in der EU.
- **Wer hat was geändert:** Jede Zeile in der Datenbank speichert Zeitpunkt (`updated_at`)
  und Benutzer (`updated_by`) der letzten Änderung.
