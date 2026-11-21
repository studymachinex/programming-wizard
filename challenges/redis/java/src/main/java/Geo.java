/**
 * Geohash de 52 bits (26 por coordenada), como o Redis guarda localizações num sorted set:
 * a latitude ocupa os bits pares e a longitude os ímpares do score.
 */
final class Geo {
  static final double LAT_MIN = -85.05112878;
  static final double LAT_MAX = 85.05112878;
  static final double LON_MIN = -180;
  static final double LON_MAX = 180;
  static final int STEP = 26;
  static final double EARTH_RADIUS_METERS = 6372797.560856;

  private Geo() {}

  static boolean valid(double lon, double lat) {
    return lon >= LON_MIN && lon <= LON_MAX && lat >= LAT_MIN && lat <= LAT_MAX;
  }

  static long encode(double lon, double lat) {
    double latOffset = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN);
    double lonOffset = (lon - LON_MIN) / (LON_MAX - LON_MIN);
    long latBits = (long) (latOffset * (1L << STEP));
    long lonBits = (long) (lonOffset * (1L << STEP));
    return interleave(latBits, lonBits);
  }

  /** Centro da célula do geohash: [longitude, latitude]. */
  static double[] decode(long hash) {
    long latBits = squash(hash);
    long lonBits = squash(hash >>> 1);
    double latMin = LAT_MIN + (latBits * 1.0 / (1L << STEP)) * (LAT_MAX - LAT_MIN);
    double latMax = LAT_MIN + ((latBits + 1) * 1.0 / (1L << STEP)) * (LAT_MAX - LAT_MIN);
    double lonMin = LON_MIN + (lonBits * 1.0 / (1L << STEP)) * (LON_MAX - LON_MIN);
    double lonMax = LON_MIN + ((lonBits + 1) * 1.0 / (1L << STEP)) * (LON_MAX - LON_MIN);
    double lon = Math.max(LON_MIN, Math.min(LON_MAX, (lonMin + lonMax) / 2));
    double lat = Math.max(LAT_MIN, Math.min(LAT_MAX, (latMin + latMax) / 2));
    return new double[] {lon, lat};
  }

  /** Distância em metros pela fórmula de haversine. */
  static double distance(double lon1, double lat1, double lon2, double lat2) {
    double lat1r = Math.toRadians(lat1);
    double lat2r = Math.toRadians(lat2);
    double u = Math.sin((lat2r - lat1r) / 2);
    double v = Math.sin(Math.toRadians(lon2 - lon1) / 2);
    return 2.0 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(u * u + Math.cos(lat1r) * Math.cos(lat2r) * v * v));
  }

  static double toMeters(double value, String unit) {
    return switch (unit.toLowerCase()) {
      case "km" -> value * 1000;
      case "mi" -> value * 1609.34;
      case "ft" -> value * 0.3048;
      default -> value;
    };
  }

  /** Coloca os bits de x nas posições pares e os de y nas ímpares. */
  private static long interleave(long x, long y) {
    long result = 0;
    for (int i = 0; i < STEP; i++) {
      result |= ((x >>> i) & 1L) << (2 * i);
      result |= ((y >>> i) & 1L) << (2 * i + 1);
    }
    return result;
  }

  /** Recolhe os bits pares de `value`. */
  private static long squash(long value) {
    long result = 0;
    for (int i = 0; i < STEP; i++) result |= ((value >>> (2 * i)) & 1L) << i;
    return result;
  }
}
