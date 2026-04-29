# Easy-WoL Design

## Ziel
Easy-WoL ist eine selbst gehostete Docker-Webapp fuer zwei oder mehr Standorte. Die Webapp laeuft zentral auf `dunas01` und kann PCs an verschiedenen Standorten per Wake-on-LAN starten, obwohl WoL-Pakete nur innerhalb des jeweiligen lokalen Layer-2-Netzes zuverlaessig funktionieren.

## Ausgangslage
- Standort A: Netzwerk mit NAS `dunas01`; Docker soll hier laufen.
- Standort B: anderes Netzwerk mit Raspberry Pi Zero W; der Pi ist per SSH und Tailscale erreichbar.
- Benutzer will eine moderne Weboberflaeche zum Verwalten von Standorten und PCs.
- Benutzer will pro PC einen Wake-Button, der automatisch den richtigen Standort-Sender verwendet.

## Architektur
Die Anwendung besteht aus einer zentralen Webapp und Standort-Sendern.

- Zentrale Webapp: laeuft als Docker-Container auf `dunas01`.
- Lokaler Sender: fuer Standort A sendet das Backend Magic Packets direkt vom Host/Container in das lokale Netzwerk.
- SSH-Sender: fuer Standort B verbindet sich das Backend per SSH zum Raspberry Pi und fuehrt dort einen WoL-Befehl aus.
- Datenhaltung: SQLite-Datei in einem Docker-Volume.

Diese Architektur vermeidet den Fehler, WoL-Pakete ueber Tailscale direkt an Ziel-PCs schicken zu wollen. Tailscale/SSH wird nur zur Steuerung des Raspberry Pi genutzt; das Magic Packet entsteht im Zielnetz.

## MVP-Funktionen
- Login mit einem Admin-Passwort aus Umgebungsvariable `ADMIN_PASSWORD`.
- Dashboard mit Standorten, Geraeten, Online/Offline-Status und Wake-Aktion.
- Standortverwaltung:
  - Name
  - Typ: `local` oder `ssh`
  - Broadcast-Adresse, z. B. `192.168.1.255`
  - SSH Host, Port, Benutzer und optional Remote-WoL-Befehl fuer `ssh` Standorte
- Geraeteverwaltung:
  - Name
  - MAC-Adresse
  - IPv4-Adresse fuer Status-Ping
  - Standort
  - Notiz
- Wake-Aktion:
  - `local`: Backend sendet UDP Magic Packet an die Broadcast-Adresse.
  - `ssh`: Backend fuehrt auf dem Pi einen Befehl wie `wakeonlan -i <broadcast> <mac>` aus.
- Statuspruefung:
  - Backend prueft bekannte IPs per TCP-Port-Probe auf 22, 80, 3389 und optional ICMP-nahe Fallbacks, soweit plattform- und containerfreundlich moeglich.
- Ereignisprotokoll:
  - Wake-Versuche werden mit Zeit, Zielgeraet, Standort, Ergebnis und Fehlermeldung gespeichert.

## Nicht im MVP
- Multi-User-Rollen.
- Auto-Discovery per ARP-Scan.
- Verschluesselte Secret-Verwaltung ausserhalb von Docker-Umgebungsvariablen und gemounteten SSH-Keys.
- Native Mobile-App.
- Vollstaendiger Monitoring-Ersatz.

## Docker-Betrieb
Die Webapp wird per Docker Compose betrieben.

- Container-Port: `8080`.
- Persistente Daten: `/app/data/easy-wol.sqlite`.
- SSH-Key-Mount: optional `/app/ssh/id_ed25519:ro`.
- Fuer lokale WoL-Pakete wird `network_mode: host` empfohlen, weil Broadcast-WoL aus Docker-Bridge-Netzen unzuverlaessig ist.

## Sicherheit
- Die App ist fuer Heimnetz/Tailscale gedacht, nicht direkt fuer das offene Internet.
- Login ist verpflichtend.
- SSH-Verbindungen nutzen einen privaten Key, der nur read-only in den Container gemountet wird.
- Eingaben werden validiert: MAC-Adresse, IPv4-Adresse, Broadcast-Adresse, SSH-Port.
- Remote-Befehle werden nicht frei aus Geraetedaten zusammengesetzt; MAC und Broadcast werden validiert und als klar begrenzte Argumente eingesetzt.

## UI-Richtung
Die Oberflaeche soll wie ein kompaktes Control Center wirken, nicht wie ein generisches Admin-Panel.

- Dunkle technische Optik mit klaren Akzentfarben, aber kein Standard-Purple-Dashboard.
- Standort-Spalten oder Standort-Karten mit sichtbarem Netzwerk-Kontext.
- Geraete als dichte, scanbare Zeilen/Karten mit Statuspunkt, IP, MAC und Wake-Button.
- Mobile Ansicht muss Wake-Buttons schnell erreichbar machen.
- Aktionen zeigen unmittelbares Feedback: laeuft, erfolgreich, fehlgeschlagen.

## Fehlerbehandlung
- Fehlende oder ungueltige Konfiguration blockiert nur den betroffenen Standort, nicht die gesamte App.
- SSH-Fehler werden sichtbar im Eventlog gespeichert.
- Wake-on-LAN kann technisch keinen Start garantieren; Erfolg bedeutet nur, dass das Magic Packet erfolgreich versendet oder der Remote-Befehl erfolgreich ausgefuehrt wurde.
- Online-Status wird separat durch Statuspruefung bestimmt.

## Teststrategie
- Unit-Tests fuer Validierung, Magic-Packet-Erzeugung, Standort-Routing und SSH-Befehlsaufbau.
- API-Tests fuer Login, CRUD von Standorten/Geraeten und Wake-Endpunkte.
- Build-Test fuer Frontend und Docker-relevante Artefakte.
- Manuelle Smoke-Tests auf `dunas01` und Raspberry Pi mit echten MAC-Adressen nach Deployment.

## Akzeptanzkriterien
- Docker Compose startet die Webapp auf `dunas01`.
- Benutzer kann sich einloggen.
- Benutzer kann zwei Standorte anlegen: NAS/lokal und Pi/SSH.
- Benutzer kann PCs mit MAC/IP einem Standort zuordnen.
- Klick auf Wake fuer ein lokales Geraet sendet ein Magic Packet im NAS-Netz.
- Klick auf Wake fuer ein Remote-Geraet fuehrt per SSH auf dem Pi den WoL-Befehl aus.
- Wake-Versuche sind im Eventlog sichtbar.
- UI ist auf Desktop und Smartphone benutzbar.
