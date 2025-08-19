# Turnier — Lokales Komplettpaket (Backend + Frontend)

## Schnellstart (lokal)
1) Backend starten
```
cd backend
cp .env.example .env
npm install
npm start
# Test: http://localhost:3001/api/health
```

2) Frontend ausliefern (nicht file:// öffnen)
```
cd ../frontend
npx http-server -p 5500
# Browser: http://localhost:5500
```
- Die `index.html` ist so gebaut, dass sie im lokalen Modus automatisch `http://localhost:3001` verwendet (über den Code in der Datei).
- Alternativ kannst du `index.with-gear.html` nutzen und rechts oben die API/WS-URL setzen.

## Logins (aus db.json)
- admin / admin123
- lieferant / lieferant123
- bude1 / bude123 (Standort: bude1)
- bude2 / bude123 (Standort: bude2)

## Hinweise
- Daten liegen in `backend/data/db.json`.
- Admin kann im Bereich **Bierbude** oben über den Picker eine Bude auswählen (Impersonation). Das Frontend sendet automatisch `X-Impersonate-Stand`.
- Bude sieht die eigene Bestellung direkt nach dem Abschicken (Server sendet zusätzlich `new_order` in den Stand-Raum).
