import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform, Share } from 'react-native';
import { destinationLink, validDestination } from '@/utils/destination-links';

export interface SavedDestination { placeId: number; name: string; latitude: number; longitude: number }
const key = (userId: number) => `delivery.saved-destinations.${userId}`;
export async function savedDestinations(userId: number): Promise<SavedDestination[]> {
  const value = await AsyncStorage.getItem(key(userId));
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((point): point is SavedDestination => Boolean(point && typeof point === 'object'
      && Number.isSafeInteger(point.placeId) && point.placeId > 0 && typeof point.name === 'string' && validDestination(point))).slice(0, 100) : [];
  } catch { return []; }
}
export async function saveDestination(userId: number, point: SavedDestination) {
  if (!validDestination(point)) throw new Error('مختصات مقصد معتبر نیست.');
  const result = [point, ...(await savedDestinations(userId)).filter(item => item.placeId !== point.placeId)].slice(0, 100);
  await AsyncStorage.setItem(key(userId), JSON.stringify(result));
  return result;
}
export async function deleteSavedDestination(userId: number, placeId: number) {
  const result = (await savedDestinations(userId)).filter(item => item.placeId !== placeId);
  await AsyncStorage.setItem(key(userId), JSON.stringify(result));
  return result;
}
export async function openDestination(point: SavedDestination) {
  if (Platform.OS === 'ios') {
    const url = destinationLink(point, true);
    if (await Linking.canOpenURL(url)) { await Linking.openURL(url); return; }
  }
  await Linking.openURL(destinationLink(point));
}
export async function shareDestination(point: SavedDestination): Promise<string | null> {
  const url = destinationLink(point);
  if (Platform.OS === 'web') {
    if (navigator.share) await navigator.share({ title: point.name, text: point.name, url });
    else if (navigator.clipboard) { await navigator.clipboard.writeText(`${point.name}\n${url}`); return 'پیوند مقصد کپی شد.'; }
    else throw new Error('اشتراک‌گذاری در این مرورگر در دسترس نیست.');
  } else await Share.share(Platform.OS === 'ios' ? { title: point.name, message: point.name, url } : { title: point.name, message: `${point.name}\n${url}` });
  return null;
}
