# Delivery panel

React administration panel built with Vite and Tailwind CSS v4.

```sh
npm ci
npm run dev
npm run build
```

Set `VITE_API_URL` in `.env.local` to the backend URL.

## Styling and components

- Use Tailwind utilities in React components. Keep complete class names in source so Tailwind can discover conditional styles during builds.
- `components/ui` contains shared buttons, form controls, modal layout, avatars, and statistic cards. These components accept native element props where applicable.
- `MapMarkers.tsx` renders reusable React marker markup for Leaflet. React escapes marker names, and marker colors use a fixed set of Tailwind classes.
- `styles.css` contains the Tailwind imports, Peyda font registrations, animation definition, and minimal global defaults. Leaflet's vendor stylesheet is imported into the components layer so utilities can override its defaults.
- Preflight is intentionally omitted to preserve the existing browser defaults and map appearance. Responsive layouts retain the original inclusive 980px and 640px boundaries.
- Semantic class names such as `selected`, `active`, and `modal` serve as scoped selector hooks; their styling is defined by Tailwind utilities.

Deployment and manual schema approval are documented in [`ops/peik-deploy/README.md`](../ops/peik-deploy/README.md).

## Courier route history

Click a courier on the map or in the list to open the history panel above the map. It shows up to ten latest days containing location records, including days older than ten calendar days when there are gaps. Dates use the Persian calendar and Tehran time.

The map initially shows the rolling last 24 hours. Selecting a day opens a two-handle slider from noon to midnight; moving a handle or choosing “نمایش این بازه” applies that day's range. Each day is fetched once on selection and range changes filter locally. “۲۴ ساعت گذشته” restores the rolling default. The existing route simplification and chronological light-to-dark blue colors are retained.

Deploy the matching backend endpoints and apply [`002_location_history_index.sql`](../delivery-backend/migrations/002_location_history_index.sql) for indexed day lookups. Timeline layout and native range-input styles are scoped in `styles.css`.

Regression checks (Node.js 22.18+):

```sh
node --test tests/historyTime.test.mjs
```

Backend routing and authorization checks use an isolated database stub. From `delivery-backend`, run `npm run build` followed by `node --test tests/location-history.test.cjs`.
