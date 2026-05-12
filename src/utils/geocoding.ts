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
    
    if (!data.display_name) return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

    // Use the full display name provided by OSM, but clean it up for the UI
    // Remove postal codes, country names, and extra whitespace
    return data.display_name
      .replace(/, \d{5,}/g, '') // Remove postal codes (e.g., 100000)
      .replace(/, Việt Nam$/i, '') // Remove country
      .replace(/, Vietnam$/i, '') // Remove country (English)
      .trim();
  } catch (error) {
    console.error('Error in reverseGeocode:', error);
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
}
