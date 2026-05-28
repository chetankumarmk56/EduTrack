interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Calculates the perpendicular projection of point P onto segment AB.
 * Returns the projected point and the relative distance t along the segment (0.0 to 1.0).
 */
function getProjectionOnSegment(p: LatLng, a: LatLng, b: LatLng) {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const L2 = dx * dx + dy * dy;
  
  if (L2 === 0) return { dist: distance(p, a), projection: a, t: 0 };
  
  let t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  
  const projection = {
    lat: a.lat + t * dy,
    lng: a.lng + t * dx
  };
  
  return { 
    dist: distance(p, projection), 
    projection, 
    t 
  };
}

function distance(a: LatLng, b: LatLng) {
  return Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2));
}

/**
 * Snaps a point to the nearest location on a polyline path.
 * Returns the snapped point and the "path distance" (cumulative index + t).
 */
export function findNearestPointOnPath(point: LatLng, path: LatLng[]) {
  if (path.length === 0) return { point, pathIndex: 0 };
  if (path.length === 1) return { point: path[0], pathIndex: 0 };

  let minData = { 
    dist: Infinity, 
    point: path[0], 
    pathIndex: 0 
  };

  for (let i = 0; i < path.length - 1; i++) {
    const { dist, projection, t } = getProjectionOnSegment(point, path[i], path[i + 1]);
    if (dist < minData.dist) {
      minData = { 
        dist, 
        point: projection, 
        pathIndex: i + t 
      };
    }
  }

  return minData;
}

/**
 * Re-orders stops based on their relative position along the path.
 *
 * Stops are typed as a generic so callers don't have to share a single Stop
 * interface — anything with lat/lng works, the function preserves the rest
 * of each stop's shape via the spread.
 */
export function sortStopsByPath<T extends LatLng>(stops: T[], path: LatLng[]): (T & { order: number })[] {
  if (path.length < 2) return stops.map((stop, i) => ({ ...stop, order: i + 1 }));

  const stopsWithIndex = stops.map(stop => {
    const { pathIndex } = findNearestPointOnPath({ lat: stop.lat, lng: stop.lng }, path);
    return { ...stop, pathIndex };
  });

  return stopsWithIndex
    .sort((a, b) => a.pathIndex - b.pathIndex)
    .map((stop, i) => ({ ...stop, order: i + 1 }));
}
