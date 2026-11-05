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

Deploy the matching backend endpoints. The history feature uses the existing database schema and requires no new migration. For large location histories, review the [optional index maintenance procedure](../delivery-backend/maintenance/README.md). Timeline layout and native range-input styles are scoped in `styles.css`.

Regression checks (Node.js 22.18+):

```sh
node --test tests/historyTime.test.mjs
```

Backend routing and authorization checks use an isolated database stub. From `delivery-backend`, run `npm run build` followed by `node --test tests/location-history.test.cjs`.

## Account management map and navigation

Account management uses the shared `LiveMap` beside a compact, scrollable account table. The map includes every available courier position, regardless of the table's search, and omits saved places and administrator positions. Administrators remain manageable in the table; accounts without a recorded position have an explicit empty-location label. The layout stacks the map above the table on narrower screens.

All maps provide zoom controls up to level 22, with native map tiles through level 19 and overzoom above that. Selecting a courier or saved place animates the camera and raises that marker above overlapping pins. Normal courier selection focuses the pin immediately, while an explicit history action or time-range change frames the route. Page scrolling and map movement respect reduced-motion preferences. Switching pages resets focus requests so each map can initially show its full set of positions.

Coordinate numbers are omitted from map popups, saved-place details, and the place form. Place creation retains the selected map coordinates internally. Shared navigation lives in `LiveMap` and `utils/mapMotion`; the compact account UI is in `UserManagementPanel`, with scoped layout styles in `styles.css`.

When checking map changes in a browser, cover overlapping courier selection, zooming to 22, account search without hiding couriers, account actions, saved-place creation, switching all three map views, mobile page overflow, reduced motion, and the existing history/date slider.

## Assignments and tasks

Clicking a saved-place pin opens courier checkboxes; clicking a courier pin opens
saved-place checkboxes. Both update the same server-side pair and show pending
writes/errors without creating duplicate tasks. The Tasks page lists pending
and completed assignments, supports completion/cancellation, and can focus the
saved place on the live map. Cancelled tasks are hidden; completed pairs can be
assigned again from a pin selector.

Pin clicks stop an existing camera animation and open their popup in place.
Sidebar selections still move the camera. Marker icons and position tuples are
memoized, preventing popup writes and task refreshes from replacing marker DOM.
Popup auto-pan is independent of camera focus and only keeps the box in view.
Saved places now use a building marker distinct from courier pins.

The Vite build includes both `index.html` and `driver-map.html`. Publish the
entire `dist` output so the native app can load its dedicated map entry point.
The task map page has no task API access or token; it accepts coordinate/name
data from the authenticated app, validates it, and inserts names as text.
Tasks require the real database migration documented in
[`TASKS.md`](../delivery-backend/TASKS.md); build output alone cannot persist them.

The panel can be published ahead of the task service. A 404 or 503 from the task
API shows a Persian availability message and disables assignment writes while
keeping the map and account/place management usable. The task list does not
present an unavailable service as an empty result. Periodic refresh and the
retry action enable assignments once the service is ready. Publish both HTML
entry points and all assets; no schema change is needed for this panel release.

Assignment popups close on a pointer press anywhere outside their content,
including outside the map. Controls inside the popup remain interactive; the
document listener exists only while a popup is open and is removed on map
unmount. Timeline range edits update only the route while preserving the map's
center and zoom. Explicit history requests and sidebar navigation still focus
the map as before.
