const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRIVATE_IPV4_PATTERN =
  /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/;

export function isDeliveryUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function validatedExternalTrackingUrl(value: string) {
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.port ||
      !hostname.includes(".") ||
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.includes(":") ||
      PRIVATE_IPV4_PATTERN.test(hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function isCourierLocationInput(input: {
  bearingDegrees?: number;
  horizontalAccuracyMeters: number;
  latitude: number;
  longitude: number;
  observedAt: string;
  speedMetersPerSecond?: number;
}) {
  const observedAt = Date.parse(input.observedAt);
  const now = Date.now();
  return (
    Number.isFinite(input.latitude) &&
    input.latitude >= -90 &&
    input.latitude <= 90 &&
    Number.isFinite(input.longitude) &&
    input.longitude >= -180 &&
    input.longitude <= 180 &&
    Number.isFinite(input.horizontalAccuracyMeters) &&
    input.horizontalAccuracyMeters >= 0 &&
    input.horizontalAccuracyMeters <= 5000 &&
    (input.bearingDegrees === undefined ||
      (Number.isFinite(input.bearingDegrees) &&
        input.bearingDegrees >= 0 &&
        input.bearingDegrees < 360)) &&
    (input.speedMetersPerSecond === undefined ||
      (Number.isFinite(input.speedMetersPerSecond) &&
        input.speedMetersPerSecond >= 0 &&
        input.speedMetersPerSecond <= 100)) &&
    Number.isFinite(observedAt) &&
    observedAt >= now - 10 * 60 * 1000 &&
    observedAt <= now + 30 * 1000
  );
}
