"use server";

export interface PlacePrediction {
  placeId: string;
  mainText: string;
  secondaryText?: string;
  fullText: string;
}

export interface ParsedAddressResult {
  title?: string;
  addressLine1: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  country: string;
  googleMapsUrl: string;
  formattedAddress: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

/**
 * Autocomplete address or business query via Google Places API (New)
 */
export async function searchPlacesAutocomplete(query: string): Promise<PlacePrediction[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[Places API] GOOGLE_MAPS_API_KEY is not configured.");
    return [];
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input: trimmed,
      }),
      // Cache briefly for repeated keystrokes
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Places API] Autocomplete failed:", res.status, errText);
      return [];
    }

    const data = await res.json();
    const suggestions = data.suggestions || [];

    return suggestions
      .filter((s: { placePrediction?: unknown }) => Boolean(s.placePrediction))
      .map((s: { placePrediction: {
        placeId: string;
        text?: { text: string };
        structuredFormat?: {
          mainText?: { text: string };
          secondaryText?: { text: string };
        };
      } }) => {
        const pred = s.placePrediction;
        return {
          placeId: pred.placeId,
          mainText: pred.structuredFormat?.mainText?.text || pred.text?.text || "",
          secondaryText: pred.structuredFormat?.secondaryText?.text,
          fullText: pred.text?.text || pred.structuredFormat?.mainText?.text || "",
        };
      });
  } catch (err) {
    console.error("[Places API] Autocomplete error:", err);
    return [];
  }
}

/**
 * Retrieve and parse detailed address components for a selected Google placeId
 */
export async function getPlaceDetails(placeId: string): Promise<ParsedAddressResult | null> {
  if (!placeId) return null;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[Places API] GOOGLE_MAPS_API_KEY is not configured.");
    return null;
  }

  try {
    const fields = "id,displayName,formattedAddress,addressComponents,googleMapsUri,location";
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=${fields}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Places API] GetPlaceDetails failed:", res.status, errText);
      return null;
    }

    const data = await res.json();
    const components: Array<{ longText: string; shortText: string; types: string[] }> =
      data.addressComponents || [];

    let streetNumber = "";
    let subpremise = "";
    let route = "";
    let sublocality = "";
    let locality = "";
    let adminLevel2 = "";
    let adminLevel1 = "";
    let postalCode = "";
    let country = "";

    for (const comp of components) {
      const types = comp.types || [];
      if (types.includes("street_number")) streetNumber = comp.longText;
      if (types.includes("subpremise")) subpremise = comp.longText;
      if (types.includes("route")) route = comp.longText;
      if (types.includes("sublocality_level_1") || types.includes("sublocality")) sublocality = comp.longText;
      if (types.includes("locality")) locality = comp.longText;
      if (types.includes("administrative_area_level_2")) adminLevel2 = comp.longText;
      if (types.includes("administrative_area_level_1")) adminLevel1 = comp.longText;
      if (types.includes("postal_code") || types.includes("postal_code_prefix")) {
        postalCode = comp.longText || comp.shortText || "";
      }
      if (types.includes("country")) country = comp.longText;
    }

    // Fallback: Check if formattedAddress contains a 5-digit postal code pattern
    if (!postalCode && data.formattedAddress) {
      const match = data.formattedAddress.match(/\b\d{5}\b/);
      if (match) {
        postalCode = match[0];
      }
    }

    // Clean Thai administrative prefixes if present
    const cleanPrefix = (str: string, prefixes: string[]) => {
      let cleaned = str.trim();
      for (const p of prefixes) {
        if (cleaned.startsWith(p)) {
          cleaned = cleaned.slice(p.length).trim();
        }
      }
      return cleaned;
    };

    const cleanProvince = cleanPrefix(adminLevel1, ["Chang Wat ", "Changwat ", "Province ", "จังหวัด"]);
    const cleanDistrict = cleanPrefix(adminLevel2 || locality, ["Amphoe ", "Khet ", "District ", "อำเภอ", "เขต"]);
    const cleanSubdistrict = cleanPrefix(sublocality || locality, ["Tambon ", "Khwaeng ", "Subdistrict ", "ตำบล", "แขวง"]);

    // Build Address Line 1
    const lineParts: string[] = [];
    if (subpremise) lineParts.push(subpremise);
    if (streetNumber) lineParts.push(streetNumber);
    if (route) lineParts.push(route);

    let addressLine1 = lineParts.join(" ").trim();
    if (!addressLine1 && data.formattedAddress) {
      // Fallback: take first section before commas
      addressLine1 = data.formattedAddress.split(",")[0]?.trim() || "";
    }

    return {
      title: data.displayName?.text || "",
      addressLine1,
      subdistrict: cleanSubdistrict,
      district: cleanDistrict,
      province: cleanProvince,
      postalCode,
      country: country || "Thailand",
      googleMapsUrl: data.googleMapsUri || "",
      formattedAddress: data.formattedAddress || "",
      location: data.location ? {
        latitude: data.location.latitude,
        longitude: data.location.longitude,
      } : undefined,
    };
  } catch (err) {
    console.error("[Places API] GetPlaceDetails error:", err);
    return null;
  }
}
