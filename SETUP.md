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
