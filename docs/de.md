# Samsung SyncThru

## Überblick

Diese Integration überwacht deine **Samsung-Drucker** (Xpress, ProXpress, MultiXpress, CLP, CLX,
SCX, ML… und die HP-Modelle der früheren Samsung-Reihe mit derselben Weboberfläche) über ihren
eingebauten Webdienst **SyncThru**: den Druckerstatus, den Füllstand jedes Toners, die
Bildeinheiten (Trommeln), die Papierfächer und den Seitenzähler. Alles bleibt in deinem lokalen
Netzwerk: keine Cloud, kein Konto, kein Passwort.

Die Integration ist **schreibgeschützt**: Es wird nichts gedruckt, keine
Einstellung des Druckers geändert und nichts zum Ein- oder Ausschalten angeboten.

Diese Integration ergänzt **IPP Printers** für die Samsung-Modelle, deren IPP-Dienst die
Verbrauchsmaterialien nicht meldet.

> **Ohne die Hardware entwickelt: Rückmeldungen sind willkommen.** Die Integration wurde mit
> echten SyncThru-Antworten geschrieben und getestet, die die Projekte pysyncthru und Home
> Assistant veröffentlicht haben, nicht an einem Drucker. Wenn bei dir etwas fehlt oder falsch
> ist, eröffne ein Issue im GitHub-Repository mit dem Ergebnis der Schaltfläche **Drucker testen**.

Nicht mit Samsung oder HP verbunden.

## Voraussetzungen

- Gladys Assistant 5.1 oder neuer.
- Ein Samsung-Drucker in deinem Netzwerk (Ethernet oder WLAN), dessen **SyncThru**-Seite sich im
  Browser unter `http://<Adresse des Druckers>/` öffnet. Die Integration liest
  `http://<Adresse des Druckers>/sws/app/information/home/home.json`: Zeigt diese Adresse in
  deinem Browser eine Textseite, ist der Drucker kompatibel.
- Besser: eine feste Adresse für den Drucker (eine DHCP-Reservierung im Router). Die Integration
  sucht einen Drucker, der umgezogen ist, aber eine feste Adresse ist zuverlässiger.

## Konfiguration

1. Installiere die Integration aus dem Store (oder **Integrationen → Von GitHub installieren** mit
   der Adresse des Repositorys).
2. Öffne ihren Tab **Konfiguration**:
   - **Drucker (manuelle Liste)**: optional. Die IP-Adressen oder Hostnamen deiner Drucker, durch
     Kommas getrennt (`192.168.1.20, drucker.local`). Eine `http://`- oder `https://`-Adresse mit
     Port geht auch. Fülle sie aus, wenn der Drucker nicht automatisch gefunden wird.
   - **Sprache der Namen**: die Sprache der Funktionsnamen (beim Hinzufügen des Druckers
     festgelegt) und der Texte an Gladys (Status, Szenenvariablen). Standardmäßig Französisch.
   - **Abfrageintervall**: wie oft jeder Drucker gelesen wird, standardmäßig alle 60 Sekunden
     (30 bis 3600).
   - **Schwelle für niedrigen Füllstand**: der Füllstand in %, bei dem **Verbrauchsmaterial fast
     leer** auslöst (standardmäßig 10 %). Danach richten sich auch die Farben der Anzeigen im Widget.
3. Speichere, öffne den Tab **Entdecken** und füge deine Drucker zu Gladys hinzu.

Drucker, die auf die Netzwerksuche antworten (SSDP, so wie Windows sie findet), erscheinen ohne
Eingabe im Tab „Entdecken“: Gladys schickt die Suche und gibt die Antworten an die Integration
weiter, die nur diejenigen behält, die wirklich SyncThru anbieten.

Netzwerklast: eine kleine Anfrage pro Drucker in jedem Abfrageintervall, die Seitenzähler alle
15 Minuten und eine Netzwerksuche beim Start, beim Öffnen des Tabs „Entdecken“ und höchstens alle
30 Minuten, solange ein Drucker nicht antwortet. Nur geänderte Werte gehen an Gladys, stabile
Werte erneut alle 6 Stunden.

## Geräte

Ein Gerät pro Drucker, benannt nach Modell und Standort (`Samsung C430W (Wohnzimmer)`). Seine
Funktionen hängen davon ab, was der Drucker meldet:

| Funktion                                     | Typ                          | Wert                                                                                                                                |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Status                                       | Text                         | Bereit, Druckt, Energiesparmodus, Aufwärmen, Beschäftigt, Toner niedrig, Warnung, Papierstau, Kein Papier, Fehler, Nicht erreichbar |
| Online                                       | Anwesenheitssensor (ja/nein) | 1, wenn der Drucker antwortet, sonst 0                                                                                              |
| Toner Schwarz / Cyan / Magenta / Gelb        | Füllstand (%)                | der verbleibende Toner jeder Kartusche                                                                                              |
| Trommel Schwarz / …, Trommel Farbe           | Füllstand (%)                | die verbleibende Lebensdauer der Bildeinheit, wenn der Drucker sie meldet                                                           |
| Fach 1 … 5, Mehrzweckzufuhr, Manuelle Zufuhr | Text                         | Bereit, Leer oder Warnung mit dem Code des Druckers                                                                                 |
| Papier Fach                                  | Füllstand (%)                | nur bei Modellen, die einen Papierfüllstand melden                                                                                  |
| Gedruckte Seiten, Kopierte Seiten            | Zähler                       | die Seitenzähler, bei Modellen, die sie anbieten                                                                                    |

Antwortet der Drucker nicht, wird **Status** zu **Nicht erreichbar** und **Online** zu 0; die
anderen Werte behalten ihre letzte Messung.

Der **Status** kommt aus dem vom Drucker gemeldeten Zustand und dem Text seines Bedienfelds, auf
Englisch, Französisch, Deutsch oder Spanisch: Ein Papierstau oder ein leeres Fach wird am
Bedienfeld erkannt („Paper Jam“, „Bourrage“, „Papierstau“, „Atasco“…) und an den
Samsung-Fehlercodes (`M1-1110`, `M1-5112`).

## Widget

Das Widget **Drucker** zeigt einen Drucker (den zuerst hinzugefügten, wenn in seinen Einstellungen
keiner gewählt ist):

- bis zu fünf Anzeigen, zuerst die Toner, dann die Trommeln, gefärbt nach der Schwelle;
- den Status, den Text des Bedienfelds, die Fächer, den Seitenzähler und die Uhrzeit der letzten
  Messung;
- eine Schaltfläche **Aktualisieren**, die den Drucker sofort liest.

## Szenenauslöser

Zwei Auslöser, in der Kategorie **Integrationen** des Szeneneditors:

- **Verbrauchsmaterial fast leer**: Ein Toner oder eine Trommel sinkt auf die Schwelle der
  Konfiguration. Filter auf einen Drucker und die Art des Materials (Toner, Trommel). Gibt den
  Druckernamen, das Material (`Toner Schwarz`) und seinen Füllstand weiter.
- **Papierstau oder kein Papier**: Ein Drucker meldet einen Papierstau oder hat kein Papier mehr.
  Filter auf einen Drucker und das Problem. Gibt den Druckernamen, das Problem in Worten und den
  Text des Bedienfelds weiter.

Jeder löst einmal aus, wenn die Situation beginnt. Nach einem Neustart der Integration oder von
Gladys löst er für eine bereits bestehende Situation nicht erneut aus.

Die Füllstände sind auch gewöhnliche Gladys-Funktionen: Der Auslöser des Kerns **Änderung von
Gerätestatus** funktioniert darauf, für eine Kartusche.

## Konfigurationsaktion

**Drucker testen**, im Tab „Konfiguration“: Gib eine Adresse ein, die Integration liest den
Drucker sofort und sagt dir, was sie gefunden hat (Modell, Status, Füllstände) oder warum keine
Antwort kam.

## Szenenbeispiele

- **Toner rechtzeitig bestellen**: Auslöser _Verbrauchsmaterial fast leer_ (Art: Toner) → Aktion
  _Nachricht senden_ mit den Variablen **Drucker**, **Verbrauchsmaterial** und **Füllstand (%)**
  (tippe `{{` in die Nachricht, um sie einzufügen): „Bürodrucker: Toner Schwarz bei 10 %“.
- **Der Drucker hängt**: Auslöser _Papierstau oder kein Papier_ → Aktion _Nachricht senden_ mit dem
  Problem und dem Text des Bedienfelds, an die Person, die am nächsten ist.
- **Drucker vergessen auszuschalten**: Auslöser _Änderung von Gerätestatus_ auf **Online** bei 1,
  Bedingung _nach 22 Uhr_ → eine Erinnerung oder das Ausschalten der smarten Steckdose des
  Druckers.

## Fehlerbehebung

- **Kein Drucker im Tab „Entdecken“**: Trage seine Adresse in die manuelle Liste ein und nutze dann
  **Drucker testen**. „Kein SyncThru-JSON-Dienst“ bedeutet, dass der Drucker keine
  SyncThru-JSON-Seite hat: Ältere Modelle haben nur HTML-Seiten, die nicht unterstützt werden.
- **„Keine Antwort“**: Prüfe die Adresse, ob der Drucker eingeschaltet und nicht im Tiefschlaf ist
  und ob er im selben Netzwerk wie Gladys ist. Manche Drucker schalten im Tiefschlaf ihr Netzwerk
  ab.
- **Ein Drucker mit verborgener Seriennummer** (manche Firmwares zeigen `xxxxxxxx`) wird an seiner
  MAC-Adresse oder an seiner Adresse erkannt: Gib ihm eine feste Adresse.
- **Mehr Details**: Setze die Umgebungsvariable `LOG_LEVEL` der Integration auf `debug`.

## Einschränkungen

- **Ohne die Hardware entwickelt**: Die Werte wurden an veröffentlichten Antworten von M2070,
  C430W und C480FW geprüft, nicht an einem echten Drucker. Die HP-Modelle sind nicht geprüft.
- Das **Papierformat** der Fächer wird nicht angezeigt: SyncThru liefert einen Zahlencode, dessen
  Bedeutung nicht dokumentiert ist.
- Der **Papierfüllstand** eines Fachs wird nur bei Modellen gelesen, die ihn melden, und in %
  angenommen.
- Die Erkennung von Papierstau und leerem Fach beruht auf dem Text des Bedienfelds und den
  Samsung-Fehlercodes: Ein Bedienfeld in einer anderen als den vier obigen Sprachen zeigt
  vielleicht nur **Warnung** oder **Fehler**.
- Drucker, die nur die alten HTML-Seiten von SyncThru haben (kein `home.json`), werden nicht
  unterstützt.
- Schreibgeschützt: kein Drucken, keine Einstellung, kein Zurücksetzen aus der Ferne.
- Die Funktionsnamen werden beim Hinzufügen des Druckers festgelegt: Eine spätere Änderung der
  Sprache ändert die Statustexte, nicht die Namen.
