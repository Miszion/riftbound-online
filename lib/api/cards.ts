import { API_BASE_URL } from '@/lib/apiConfig';

export type CatalogCardDTO = {
  id: string;
  slug: string;
  name: string;
  type: string | null;
  rarity: string | null;
  setName?: string | null;
  colors: string[];
  cost?: {
    energy?: number | null;
    powerSymbols?: number | null;
    raw?: string | null;
  } | null;
  might?: number | null;
  tags?: string[];
  effect: string;
  flavor?: string | null;
  keywords: string[];
  activation?: {
    timing?: string | null;
    stateful?: boolean | null;
  } | null;
  rules?: string[];
  assets?: {
    remote: string | null;
    localPath: string;
  } | null;
  pricing?: {
    price?: number | null;
    foilPrice?: number | null;
    currency?: string | null;
  } | null;
  references?: {
    marketUrl?: string | null;
    source?: string | null;
  } | null;
};

export type CardListParams = {
  domain?: string;
  type?: string;
  rarity?: string;
  q?: string;
  sort?: 'name' | 'cost' | 'rarity';
  order?: 'asc' | 'desc';
  cursor?: string | null;
  limit?: number;
};

export type CardListResponse = {
  items: CatalogCardDTO[];
  pageInfo: {
    nextCursor: string | null;
    total: number;
    hasMore: boolean;
  };
};

export class CardsApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message?: string) {
    super(message || `cards api request failed with status ${status}`);
    this.name = 'CardsApiError';
    this.status = status;
    this.body = body;
  }
}

const CARDS_ENDPOINT = `${API_BASE_URL}/api/cards`;

const buildQueryString = (params: CardListParams): string => {
  const search = new URLSearchParams();
  const append = (key: string, value: string | number | null | undefined) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      search.append(key, trimmed);
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      search.append(key, String(value));
    }
  };

  append('domain', params.domain);
  append('type', params.type);
  append('rarity', params.rarity);
  append('q', params.q);
  append('sort', params.sort);
  append('order', params.order);
  append('cursor', params.cursor ?? undefined);
  append('limit', params.limit);

  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export async function fetchCards(
  params: CardListParams,
  signal?: AbortSignal
): Promise<CardListResponse> {
  const url = `${CARDS_ENDPOINT}${buildQueryString(params)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      body = '';
    }
    throw new CardsApiError(
      response.status,
      body,
      `cards api ${response.status} ${response.statusText} for ${url}: ${body.slice(0, 200)}`
    );
  }

  const json = (await response.json()) as CardListResponse;
  return json;
}

// Exposed for testing.
export const __test__ = { buildQueryString, CARDS_ENDPOINT };
