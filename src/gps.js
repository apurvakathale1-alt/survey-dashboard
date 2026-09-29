const MAX_MERCATOR_LATITUDE = 85.05112878;

function getGpsPosition(gps) {
  if (!gps || gps.latitude === undefined || gps.longitude === undefined) return null;

  const status = String(gps.status || '').toUpperCase();
  if (/NO[\s_-]*FIX|INVALID|SEARCHING|GPS_LOST/.test(status)) return null;

  const latitude = Number(gps.latitude);
  const longitude = Number(gps.longitude);
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > MAX_MERCATOR_LATITUDE ||
    longitude < -180 || longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  return { latitude, longitude };
}

export { getGpsPosition };