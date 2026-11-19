const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');

function compile(file, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(resolve(__dirname, '../src/services', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected native dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const pushState = compile('push-state.ts');
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
function fixture(options = {}) {
  const calls = { channel: 0, native: 0, expo: 0, register: [], remove: [], local: [], test: [], requested: 0, settings: 0 };
  let cached = options.cached || null;
  const notifications = {
    AndroidImportance: { HIGH: 4, NONE: 0 }, AndroidNotificationVisibility: { PUBLIC: 1 }, IosAuthorizationStatus: { PROVISIONAL: 3 },
    setNotificationHandler: handler => { calls.handler = handler; },
    setNotificationChannelAsync: async () => { calls.channel++; },
    getPermissionsAsync: async () => options.permission || { granted: true, canAskAgain: true },
    requestPermissionsAsync: async () => { calls.requested++; return { granted: true }; },
    getNotificationChannelAsync: async () => ({ importance: options.blockedChannel ? 0 : 4 }),
    getDevicePushTokenAsync: async () => { calls.native++; return options.native ? options.native() : { type: 'android', data: 'private-device-token' }; },
    getExpoPushTokenAsync: async input => { calls.expo++; assert.equal(input.projectId, 'fixture-project'); return { data: 'ExpoPushToken[private-test-token]' }; },
    scheduleNotificationAsync: async input => { calls.local.push(input); },
    dismissAllNotificationsAsync: async () => {},
  };
  const api = {
    ApiError,
    registerPushDevice: async (...args) => { calls.register.push(args); if (options.serverError) throw options.serverError; },
    removePushDevice: async (...args) => { calls.remove.push(args); },
    testPushDevice: async (...args) => { calls.test.push(args); if (options.testError) throw options.testError; },
  };
  const module = compile('push-notifications.native.ts', {
    'expo-notifications': notifications,
    'expo-constants': { executionEnvironment: options.expoGo ? 'storeClient' : 'standalone', expoConfig: { extra: { notificationsConfigured: !options.missingFirebase, eas: { projectId: 'fixture-project' } } } },
    'react-native': { Platform: { OS: 'android' }, Linking: { sendIntent: async () => { calls.settings++; }, openSettings: async () => { calls.settings++; } } },
    './api': api,
    './token-storage': { tokenStorage: { getPushToken: async () => cached, setPushToken: async value => { cached = value; }, removePushToken: async () => { cached = null; } } },
    './push-state': options.fastTimeout ? { ...pushState, pushOperation: (operation, stage, _milliseconds, signal) => pushState.pushOperation(operation, stage, 10, signal) } : pushState,
  });
  return { module, calls, cached: () => cached };
}

test('native registration enables OS foreground banners/list/sound and registers the authenticated phone', async () => {
  const { module, calls } = fixture();
  assert.deepEqual(await calls.handler.handleNotification(), { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false });
  const result = await module.registerTaskNotifications('authenticated-session', true);
  assert.equal(result.status, 'ready');
  assert.equal(calls.native, 1); assert.equal(calls.expo, 1);
  assert.equal(calls.register[0][0], 'authenticated-session'); assert.equal(calls.register[0][2], 'android');
});
test('automatic permission checks do not prompt; an explicit activation does', async () => {
  const { module, calls } = fixture({ permission: { granted: false, canAskAgain: true } });
  assert.equal((await module.registerTaskNotifications('session', false)).status, 'permission');
  assert.equal(calls.requested, 0);
  assert.equal((await module.registerTaskNotifications('session', true)).status, 'ready');
  assert.equal(calls.requested, 1);
});
test('blocked app permission and channel route the user to Android notification settings', async () => {
  for (const options of [{ permission: { granted: false, canAskAgain: false } }, { blockedChannel: true }]) {
    const { module, calls } = fixture(options);
    const result = await module.registerTaskNotifications('session', true);
    assert.equal(result.status, 'permission'); assert.equal(calls.settings, 1); assert.equal(calls.register.length, 0);
  }
});
test('Expo Go and APKs without Firebase return an explicit build requirement', async () => {
  for (const options of [{ expoGo: true }, { missingFirebase: true }]) {
    const { module, calls } = fixture(options);
    assert.equal((await module.registerTaskNotifications('session', true)).stage, 'build');
    assert.equal(calls.native, 0); assert.equal(calls.register.length, 0);
  }
});
test('cached Expo tokens re-register without requiring another trip to Google or Expo', async () => {
  const { module, calls } = fixture({ cached: 'ExpoPushToken[cached-test-token]' });
  assert.equal((await module.registerTaskNotifications('session')).status, 'ready');
  assert.equal(calls.native, 0); assert.equal(calls.expo, 0); assert.equal(calls.register.length, 1);
});
test('a stuck FCM request times out visibly and a late result cannot register a phone', async () => {
  let resolveNative;
  const { module, calls } = fixture({ fastTimeout: true, native: () => new Promise(resolve => { resolveNative = resolve; }) });
  const result = await module.registerTaskNotifications('session', true);
  assert.equal(result.status, 'error'); assert.equal(result.stage, 'device-token'); assert.match(result.message, /FCM/);
  resolveNative({ type: 'android', data: 'late-private-token' }); await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(calls.expo, 0); assert.equal(calls.register.length, 0);
});
test('cancellation/logout never turns a stale native request into a new registration', async () => {
  const controller = new AbortController(); controller.abort();
  const { module, calls } = fixture();
  await assert.rejects(module.registerTaskNotifications('session', true, controller.signal), { name: 'AbortError' });
  assert.equal(calls.native, 0); assert.equal(calls.register.length, 0);
});
test('server failures are visible without leaking exception details or tokens', async () => {
  const { module } = fixture({ serverError: new ApiError('secret upstream payload', 404) });
  const result = await module.registerTaskNotifications('session', true);
  assert.equal(result.stage, 'server'); assert.equal(result.status, 'error'); assert.ok(!result.message.includes('secret'));
});
test('local notification test targets the OS tasks channel rather than an in-app banner', async () => {
  const { module, calls } = fixture();
  const result = await module.testLocalTaskNotification();
  assert.equal(result.status, 'ready');
  assert.deepEqual(calls.local[0].trigger, { channelId: 'tasks' });
  assert.equal(calls.local[0].content.sound, 'default'); assert.equal(calls.local[0].content.data.type, 'push.local-test');
});
test('remote test reports provider acceptance accurately and expires rejected cached tokens', async () => {
  const { module, calls } = fixture({ cached: 'ExpoPushToken[cached-test-token]' });
  assert.equal((await module.testRemoteTaskNotification('session')).status, 'ready');
  assert.equal(calls.test[0][0], 'session');
  const rejected = fixture({ cached: 'ExpoPushToken[cached-test-token]', testError: new ApiError('Registration expired', 409) });
  assert.equal((await rejected.module.testRemoteTaskNotification('session')).status, 'error');
  assert.equal(rejected.cached(), null);
});
