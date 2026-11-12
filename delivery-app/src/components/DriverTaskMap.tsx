import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { TASK_MAP_URL } from '@/services/api';
import type { DriverTaskMapProps } from '@/types/task';

const mapUrl = TASK_MAP_URL;
const mapOrigin = new URL(mapUrl).origin;

export function DriverTaskMap({ payload, onSelectTask, onDestinationAction }: DriverTaskMapProps) {
  const webview = useRef<WebView>(null);
  const latest = useRef(payload);
  latest.current = payload;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const send = () => webview.current?.injectJavaScript(`window.updateDriverTaskMap?.(${JSON.stringify(latest.current)});true;`);
  useEffect(() => { if (ready) send(); }, [payload, ready]);
  useEffect(() => {
    const timeout = setTimeout(() => { if (!ready) setFailed(true); }, 12_000);
    return () => clearTimeout(timeout);
  }, [ready, attempt]);

  return <View style={styles.frame}>
    <WebView ref={webview} key={attempt} source={{ uri: mapUrl }} style={styles.map}
      originWhitelist={[mapOrigin]} javaScriptEnabled domStorageEnabled nestedScrollEnabled
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank') return true;
        try {
          const url = new URL(request.url);
          if (url.origin === mapOrigin && url.pathname === new URL(mapUrl).pathname) return true;
        } catch { return false; }
        if (request.url === 'https://www.openstreetmap.org/copyright') void Linking.openURL(request.url);
        return false;
      }}
      onError={() => setFailed(true)} onHttpError={(event) => { if (event.nativeEvent.url === mapUrl) setFailed(true); }}
      onMessage={(event) => {
        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === 'delivery:task-map-ready') { setReady(true); setFailed(false); send(); }
          if (message.type === 'delivery:task-selected' && payload.tasks.some((task) => task.id === message.id)) onSelectTask(message.id);
          if (message.type === 'delivery:task-action' && ['neshan', 'share', 'save'].includes(message.action)
            && payload.tasks.some(task => task.id === message.id)) onDestinationAction(message.id, message.action);
        } catch { /* Ignore unrelated or malformed bridge messages. */ }
      }} />
    {(!ready || failed) && <View style={styles.overlay}>{failed ? <>
      <Text style={styles.error}>نقشه در دسترس نیست؛ اتصال اینترنت را بررسی کنید.</Text>
      <TouchableOpacity onPress={() => { setFailed(false); setReady(false); setAttempt((value) => value + 1); }}><Text style={styles.retry}>تلاش مجدد</Text></TouchableOpacity>
    </> : <ActivityIndicator color="#0f9475" />}</View>}
  </View>;
}
const styles = StyleSheet.create({
  frame: { height: 310, borderRadius: 17, overflow: 'hidden', backgroundColor: '#eaf1ed' },
  map: { flex: 1, backgroundColor: '#eaf1ed' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 15, backgroundColor: '#f1f6f2ee' },
  error: { color: '#64748b', textAlign: 'center', lineHeight: 24, fontSize: 12 },
  retry: { color: '#0f9475', fontWeight: '700' },
});
