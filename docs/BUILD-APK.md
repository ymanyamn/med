# MED — Syrian Civil Defense | Build & Deploy

## Run (web + Node.js + WebSockets realtime)
```
npm install && npm start   # http://localhost:3000
```
Offline-first: localStorage + BroadcastChannel between tabs (citizen/central/station
in one APK), synced to server via Socket.io + `/api/*` when online.
Maps: OpenStreetMap (Leaflet). Google Maps SDK can replace tile layer.

## Android APK (Capacitor — production-ready tree)
`capacitor.config.json` (appId `sy.civildefense.med`) + workflow
`.github/workflows/apk.yml` build a debug APK on every push:
Actions → Build MED APK → download **MED-debug-apk**.
```xml
<!-- android/app/src/main/AndroidManifest.xml — required for silent background tracking -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```
Signed release: add your keystore as CI secrets then `./gradlew assembleRelease`.

## Firebase path (optional, per spec)
Auth (email-link for the admin inbox) + Firestore `incidents` realtime +
FCM chime/push. Drop `google-services.json` into `android/app/` and mirror the
`report`/`report-update` socket events to Firestore — no UI changes needed.

## Logins (credentials are private — never published here)
- Central: room password set by admin (`POST /api/admin/central-password`).
  Initial password is printed once in the server console on first boot — change it immediately.
- Stations: per-station secret code set/rotated by admin from the dashboard.
- Admin: configured inbox (`MED_ADMIN_EMAIL`) → OTP (10 min) + single-use magic link.
  Without SMTP the code is printed to the server console (test mode only).
