/**
 * Reverse geocoding helper using OpenStreetMap Nominatim API.
 * Converts lat/long coordinates to a human-readable address.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
          'User-Agent': 'Tritue8Plus Attendance App'
        }
      }
    );

    if (!response.ok) throw new Error('Geocoding failed');

    const data = await response.json();
    
    // Build a nice address string
    const addr = data.address;
    if (!addr) return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

    const parts = [];
    if (addr.building) parts.push(addr.building);
    else if (addr.amenity) parts.push(addr.amenity);
    else if (addr.shop) parts.push(addr.shop);
    else if (addr.office) parts.push(addr.office);

    if (addr.house_number || addr.road) {
      parts.push([addr.house_number, addr.road].filter(Boolean).join(' '));
    }
    
    if (addr.suburb) parts.push(addr.suburb);
    else if (addr.neighbourhood) parts.push(addr.neighbourhood);
    
    if (addr.city_district || addr.district) parts.push(addr.city_district || addr.district);
    
    if (addr.city || addr.state) parts.push(addr.city || addr.state);

    return parts.length > 0 ? parts.join(', ') : data.display_name;
  } catch (error) {
    console.error('Error in reverseGeocode:', error);
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
}
