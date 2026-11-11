# 🐞 Drohnen-Simulator (Ladybug-Drohne)

Interaktive 3D-Demo im Browser: eine Marienkäfer-Drohne fliegt über ein unebenes Gelände
durch einen zufällig erzeugten **Bézier-Parcours** mit drei großen Ringen auf
Pfosten zum zweiten Landeplatz. Komplett clientseitig mit [three.js](https://threejs.org/)
(r145, mitgeliefert) – **kein Build, kein Server nötig**: `index.html` einfach im Browser
öffnen.  
Der Simulator ist Teil eines Moodle-Kurses zum Thema Drohnen steuern. Der Kurs erklärt gesetzliche 
und rechtliche Anforderungen und Voraussetzungen, im zweiten Teil werden mit Überflugverbotskarten
und wichtigen Drohnen- und Kameraeinstellungen Flüge geplant.

<img src="docs/drohnensimulator.png" alt="Drohnen-Simulator: Kurs mit drei Ringen auf Pfosten" width="700">

## Features

- **Kamera-Dreifach-Umschalter `starr | Gimbal | Welt`**: FPV von der Drohnenase aus –
  starr gekoppelt, gedämpftes Gimbal oder welt-ausgerichtet (exakter Horizont).
- **Thumbwheel „Kamerawinkel"** mit Lineal-Skala zwischen den Steuer-Pads
  (Mauszug, Rad, Pfeiltasten) als lokaler Kopfneigungswinkel in jedem Modus.
- **Bezier-Schlangenlinie** als Parcours: 3–4 kubische Bézier-Segmente, die Biegung
  wechselt immer zur Gegenseite → echte Schlangenlinie; Sehnen-/Bogenlänge werden
  arc-length-parametrisiert abgetastet.
- **Drei farbige Ringe** (Bernstein, Grün, Rosa) auf **unterschiedlich hohen Pfosten** –
  Innenöffnung **150 % der Drohnengröße**, Ringebene exakt senkrecht zum Kurs,
  Positionen bei 25 % / 50 % / 75 % der Kurvenlänge.
- **Kollisionsanalyse** pro Frame: Drohne als Kugel gegen Ring (Torus-Mittellinie),
  Pfosten (vertikales Segment) und **Bodengelände** (inkl. Hügel über y=0). Bei Treffer:
  Zurücksetzen auf die sichere Position, Tempo 0, rote Meldung – **per Klick ausblendbar,
  danach fliegt es einfach weiter**.
- **Durchflug-Zähler** oben auf dem Canvas: „Ringe: 1 von 3" … bei allen drei
  „**3 von 3 Ringen - jetzt landen!**".
- **Ziellandung** mit grüner Erfolgsmeldung „Erfolgreich im Ziel gelandet";
  **Klick = neuer Kurs** (neues Ziel, neue Kurve, neue Ring-/Pfostenverteilung, neues Gelände).
- Rote, dem Gelände folgende Routenlinie + weiches Korridorlicht über dem Kurs.
- Wolkendrift, blinkende Positionslichter (0,5 s), zufälliges Ziel 140–260 Einheiten entfernt,
  texturierte Landeplatten, animierter Deckel-Ladybug mit schwarzen Beinen und Rotorblättern.

## Steuerung

| Eingabe | Funktion |
|---|---|
| ↑ / ↓ | Steigen / Sinken |
| ← / → | Drehen |
| W / S | Vorwärts / Rückwärts |
| A / D | Seitwärts links / rechts |
| Sicht-Knopf | Überblick ↔ FPV (Nase) |
| `starr \| Gimbal \| Welt` | FPV-Ausrichtung der Kamera |
| Kamerawinkel-Rad | Kopfneigung in der FPV |
| Klick auf Erfolgsmeldung | Neuer Kurs (alles neu gewürfelt) |
| Klick auf Kollisionsmeldung | Meldung ausblenden, Flug fortsetzen |

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Komplette App (CSS + JavaScript in einer Datei) |
| `three.min.js` | three.js r145 (MIT) |
| `Sky.js`, `OrbitControls.js` | Himmel und Orbit-Steuerung (three.js-Beispiele) |
| `deckel.png` | Deckel-Textur, Kontur der Rumpf-Extrusion **und Favicon** |
| `landing.png` | Landeplatten-Textur (mit Alpha) |
| `flag_g.png` | Bodentextur (Luftbild eines Herbstgeländes, 8×8 Kachelung) |
| `inc.css` | Reststylesheet des Ursprungshosts (nicht benötigt) |
| `docs/drohnensimulator.png` | Screenshot für diese README |
| `LICENSE` | CC BY-NC-SA 4.0 des eigenen Werks (Namensnennung, nicht-kommerziell, ShareAlike) |

## Starten

```bash
open index.html          # macOS – oder die Datei in jeden Browser ziehen
```

Alle Ressourcen liegen lokal, es werden keine externen CDN-Aufrufe gemacht.
Neue Kurse entstehen bei jedem Start bzw. jedem Klick auf die Erfolgsmeldung.

## Lizenz

**CC BY-NC-SA 4.0 – Namensnennung, nicht-kommerziell, gleiche Lizenz**
(vollständiger Text der Lizenz in [`LICENSE`](LICENSE),
Übersicht auf deutsch: <https://creativecommons.org/licenses/by-nc-sa/4.0/de>)

Das eigene Werk darf geteilt, genutzt und bearbeitet werden, sofern gilt:

1. **Namensnennung** – `© 2026 Norbert Forster, CC BY-NC-SA 4.0`
2. **Nicht kommerziell** – keine Verwendung zu kommerziellen Zwecken
3. **Weitergabe unter denselben Bedingungen** – Abwandlungen tragen dieselbe Lizenz

Enthaltene Fremdteile behalten ihre eigenen Lizenzen: `three.min.js`, `Sky.js` und
`OrbitControls.js` stammen aus dem [three.js](https://threejs.org/)-Projekt (MIT-Lizenz,
kommerzielle Nutzung durch diese Bibliothek also unberührt).
