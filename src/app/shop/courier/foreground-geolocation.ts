export type ForegroundLocationSample = {
  bearingDegrees?: number;
  horizontalAccuracyMeters: number;
  latitude: number;
  longitude: number;
  observedAt: string;
  speedMetersPerSecond?: number;
};

export type ForegroundGeolocationAdapter = {
  start(input: {
    onError: (message: string) => void;
    onLocation: (sample: ForegroundLocationSample) => void;
  }): number;
  stop(watchId: number): void;
};

export class ForegroundTrackingLifecycle {
  private generation = 0;
  private mounted = true;

  activate() {
    this.mounted = true;
    this.invalidate();
  }

  begin() {
    this.generation += 1;
    return this.generation;
  }

  capture() {
    return this.generation;
  }

  invalidate() {
    this.generation += 1;
  }

  dispose() {
    this.mounted = false;
    this.invalidate();
  }

  isCurrent(generation: number) {
    return this.mounted && generation === this.generation;
  }

  isMounted() {
    return this.mounted;
  }
}

export function createBrowserForegroundGeolocationAdapter(): ForegroundGeolocationAdapter | null {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  return {
    start({ onError, onLocation }) {
      return navigator.geolocation.watchPosition(
        (position) => {
          const { coords } = position;
          onLocation({
            bearingDegrees:
              coords.heading !== null && Number.isFinite(coords.heading)
                ? coords.heading
                : undefined,
            horizontalAccuracyMeters: coords.accuracy,
            latitude: coords.latitude,
            longitude: coords.longitude,
            observedAt: new Date(position.timestamp).toISOString(),
            speedMetersPerSecond:
              coords.speed !== null && Number.isFinite(coords.speed)
                ? coords.speed
                : undefined,
          });
        },
        (error) => onError(error.message || "Posizione non disponibile."),
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 20000,
        },
      );
    },
    stop(watchId) {
      navigator.geolocation.clearWatch(watchId);
    },
  };
}

function distanceMeters(
  left: ForegroundLocationSample,
  right: ForegroundLocationSample,
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function shouldPublishForegroundLocation(
  previous: ForegroundLocationSample | null,
  next: ForegroundLocationSample,
  config: { minDistanceMeters: number; minIntervalMilliseconds: number },
) {
  if (!previous) return true;
  const elapsed = Date.parse(next.observedAt) - Date.parse(previous.observedAt);
  return (
    elapsed >= config.minIntervalMilliseconds ||
    distanceMeters(previous, next) >= config.minDistanceMeters
  );
}

export class FakeForegroundGeolocationAdapter
  implements ForegroundGeolocationAdapter
{
  private nextWatchId = 1;
  private listeners = new Map<
    number,
    {
      onError: (message: string) => void;
      onLocation: (sample: ForegroundLocationSample) => void;
    }
  >();

  start(input: {
    onError: (message: string) => void;
    onLocation: (sample: ForegroundLocationSample) => void;
  }) {
    const watchId = this.nextWatchId++;
    this.listeners.set(watchId, input);
    return watchId;
  }

  stop(watchId: number) {
    this.listeners.delete(watchId);
  }

  emit(sample: ForegroundLocationSample) {
    for (const listener of this.listeners.values()) listener.onLocation(sample);
  }

  fail(message: string) {
    for (const listener of this.listeners.values()) listener.onError(message);
  }

  get activeWatchCount() {
    return this.listeners.size;
  }
}
