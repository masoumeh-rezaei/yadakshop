# Welcome to your Expo app 👋

## Courier tasks and destination map

The signed-in courier sees their own pending/completed tasks and destination
building pins. Authenticated Socket.IO events refresh tasks immediately; a
five-second fallback runs while disconnected and a one-minute reconciliation
runs while connected. Tasks also refresh on resuming and through the prominent
manual refresh button. Completing a task requires a confirmation dialog, updates
the server and removes its pending destination. The UI remounts on account
changes and the API scopes `/api/tasks/mine` using authentication, not a submitted
courier ID. Task updates add no background location permission or tracking.
Task cards show the exact Tehran/Persian assignment and completion timestamps
including seconds, plus a relative age refreshed every 30 seconds. The login
form scrolls to the password after keyboard/layout changes; Android uses resize
and keyboard avoidance.

The map uses the panel's bundled Leaflet page in `react-native-webview` on native
devices and an iframe on web. No Google Maps API key is needed. It receives only
the task-map payload, never a bearer token. New native binaries must include the
WebView dependency; the existing APK does not update when backend code deploys.
Selecting a pending task focuses its destination at zoom 19. The map shows a
labelled own-location pin when foreground location permission is granted, with
a separate locate-me button. Destination popups support Neshan links, sharing,
and local per-account saved destinations. Saved locations persist after task
completion. No API token is included in external map links.

### Notifications while the app is closed

The code includes device registration, a durable server outbox, notification
channels, foreground handling, and opening the assigned task from a notification.
**Firebase/FCM credentials and a newly installed native build are still required.**
Without them, live updates/manual refresh work while the app is open, but native
remote notifications are unavailable. Expo Go is not the Android remote-push test target.

1. In Firebase, register Android package `com.yadakshop.deliveryapp`. Download
   `google-services.json` to this app directory, or set `GOOGLE_SERVICES_JSON` to
   the downloaded file's path (an EAS file environment variable also works).
   `app.config.ts` detects this file; an absent file does not break non-push builds.
   For cloud builds, add it to the selected EAS environment as a **file** variable
   named `GOOGLE_SERVICES_JSON`. The profiles in `eas.json` select the matching
   development, preview or production environment. An ignored local JSON file
   alone is not uploaded to EAS; see [EAS file environment variables](https://docs.expo.dev/eas/environment-variables/).
2. Enable FCM v1 and configure its service-account credentials in the existing
   EAS project through `npx eas-cli credentials --platform android`. Follow the
   [Expo setup guide](https://docs.expo.dev/push-notifications/push-notifications-setup/).
   Google service files and standard service-account filenames are excluded from Git.
   Keep service-account credentials outside the repository. Do not
   put server/service-account credentials in `EXPO_PUBLIC_*` variables.
3. Apply backend migration `004_create_push_notifications.sql` after `002` and
   `003`, deploy matching API/panel code, and build/install a new APK using the
   preview command below. The production deployment pipeline does not run SQL.
4. Open the new app, sign in as a courier and choose **فعال‌سازی اعلان‌ها**.
   Allow OS notifications. Android creates the high-priority **وظایف جدید** channel
   before registering. Logout removes that user's registration; token rotation
   and foreground recovery re-register it. For iOS, configure APNs credentials in EAS.
5. Verify a new assignment with the app foregrounded, backgrounded and normally
   closed, then open its notification. Force-stopping Android from device settings
   prevents FCM delivery until the app is reopened; see [Firebase's lifecycle
   requirements](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages).

The backend needs outbound HTTPS access to `exp.host`. Inspect outbox state and
`last_error` when diagnosing delivery; a push ticket alone does not prove the
notification appeared on the phone.

The administrator can enable desktop notifications using the panel bell. They
are delivered while that panel tab remains open, including when another tab has
focus; the in-panel inbox provides a fallback if system permission is denied.

For local testing, run the panel Vite server and backend, then set appropriate
device-reachable URLs before starting Expo:

```text
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000
EXPO_PUBLIC_MAP_URL=http://YOUR_LAN_IP:5173/driver-map.html
```

On the Android emulator, `10.0.2.2` can replace `YOUR_LAN_IP`. For a physical phone,
use the development computer's LAN address. EAS profiles already set the
production API URL; the map URL defaults to that origin's `/driver-map.html`.
Deploy the matching panel entry point and prepare the required task migration
before installing a new build. Production APK build command:

```sh
npx eas-cli build --platform android --profile preview
```

Type checking: `npx tsc --noEmit`. Android JS/asset validation:
`npx expo export --platform android`. A bundle export is not an APK or an
on-device test. Full API and migration notes: `delivery-backend/TASKS.md`.

### EAS upload returns 403 on Windows

If login and remote credentials succeed but uploading metadata or the project
archive fails, check the connection to Google Cloud Storage. EAS CLI uses the
`https_proxy` environment variable rather than automatically reading Windows
proxy settings. When an active local HTTP proxy is required, set its actual
address in the same PowerShell window before building. For example, only if
your proxy listens on port 10809:

```powershell
$env:https_proxy = "http://127.0.0.1:10809"
npx eas-cli@latest build --platform android --profile preview
```

This setting lasts only for that PowerShell process. Keep the proxy running;
remove the variable with `Remove-Item Env:https_proxy` when using a direct
connection again. An upload-only failure does not require a new signing key.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
