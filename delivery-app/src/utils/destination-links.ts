export interface DestinationPoint { latitude: number; longitude: number }
export function validDestination(point: DestinationPoint): boolean {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}
export function destinationLink(point: DestinationPoint, ios = false): string {
  if (!validDestination(point)) throw new Error('مختصات مقصد معتبر نیست.');
  return ios ? `neshan://?ll=${point.latitude},${point.longitude}`
    : `https://nshn.ir/?lat=${point.latitude}&lng=${point.longitude}`;
}
