/** Distancia en km entre dos coordenadas usando la fórmula Haversine. */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  // Factor 1.3 para aproximar distancia por carretera (Haversine es línea recta)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.3;
}

/** Tarifa de domicilio en pesos, respetando la tarifa mínima. */
export function calcDeliveryFee(
  distKm: number,
  pricePerKm: number,
  minFee?: number | null,
): number {
  return Math.round(Math.max(distKm * pricePerKm, minFee ?? 0));
}
