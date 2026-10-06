// Local tab helpers: filters over the business list, and turning businesses into People.
import { LOCAL_BUSINESSES, type LocalBusiness } from '@/lib/local-data';

export interface LocalFilters {
  categories?: string[];
  towns?: string[];
  /** minimum Google rating */
  minRating?: number;
  /** minimum number of reviews */
  minReviews?: number;
  website?: 'has' | 'none';
  openNow?: boolean;
}

/** "14 Quay Street, Bristol" -> "Bristol" */
export const townOf = (b: LocalBusiness) => b.address.split(',').pop()!.trim();

export const RATING_STEPS = [4, 4.5, 4.8];
export const REVIEW_STEPS = [50, 100, 250, 400];

export const LOCAL_CATEGORIES = [...new Set(LOCAL_BUSINESSES.map((b) => b.category))].sort();
export const LOCAL_TOWNS = [...new Set(LOCAL_BUSINESSES.map(townOf))].sort();

export function applyLocalFilters(rows: LocalBusiness[], f: LocalFilters, text: string): LocalBusiness[] {
  const q = text.trim().toLowerCase();
  return rows.filter(
    (b) =>
      (!q || `${b.name} ${b.category} ${b.address}`.toLowerCase().includes(q)) &&
      (!f.categories?.length || f.categories.includes(b.category)) &&
      (!f.towns?.length || f.towns.includes(townOf(b))) &&
      (f.minRating == null || b.rating >= f.minRating) &&
      (f.minReviews == null || b.reviews >= f.minReviews) &&
      (!f.website || (f.website === 'has' ? !!b.website : !b.website)) &&
      (!f.openNow || b.hours.open),
  );
}
