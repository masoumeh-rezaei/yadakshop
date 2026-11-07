# Welcome to your Expo app 👋

## Courier tasks and destination map

The signed-in courier sees their own pending/completed tasks and destination
building pins. Pending tasks are checked every 15 seconds while foregrounded,
refreshed on resuming, and can be refreshed manually. Completing a task updates
the server and removes its pending destination. The UI remounts on account
changes and the API scopes `/api/tasks/mine` using authentication, not a submitted
courier ID. Task polling adds no background location permission or tracking.

The map uses the panel's bundled Leaflet page in `react-native-webview` on native
devices and an iframe on web. No Google Maps API key is needed. It receives only
the task-map payload, never a bearer token. New native binaries must include the
WebView dependency; the existing APK does not update when backend code deploys.

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
