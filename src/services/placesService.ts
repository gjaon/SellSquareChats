import api from './api';

/**
 * placesService — talks to the backend Google Places proxy (`/api/places/*`).
 * The country/state/city selects are powered offline by `country-state-city`;
 * this is ONLY used to turn a typed street address into a precise lat/lng.
 */

export interface AddressPrediction {
  description: string;
  placeId: string;
}

export interface PlaceDetails {
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string;
  country: string;
  countryCode: string;
  state: string;
  city: string;
}

export const newSessionToken = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const fetchAddressPredictions = async (
  input: string,
  opts: { country?: string; sessionToken?: string } = {}
): Promise<AddressPrediction[]> => {
  if (!input || input.trim().length < 3) return [];
  try {
    const { data } = await api.get('/api/places/autocomplete', {
      params: { input, country: opts.country, sessiontoken: opts.sessionToken },
    });
    return data?.predictions || [];
  } catch {
    return [];
  }
};

export const fetchPlaceDetails = async (
  placeId: string,
  opts: { sessionToken?: string } = {}
): Promise<PlaceDetails | null> => {
  if (!placeId) return null;
  try {
    const { data } = await api.get('/api/places/details', {
      params: { placeId, sessiontoken: opts.sessionToken },
    });
    return data || null;
  } catch {
    return null;
  }
};
