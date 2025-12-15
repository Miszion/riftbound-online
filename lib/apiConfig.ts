const apiHost = process.env.NEXT_PUBLIC_API_HOST || 'localhost';
const apiPort = process.env.NEXT_PUBLIC_API_PORT || '3000';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || `http://${apiHost}:${apiPort}`;

export const GRAPHQL_HTTP_URL = `${API_BASE_URL}/graphql`;
export const GRAPHQL_WS_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ||
  `ws://${process.env.NEXT_PUBLIC_WS_HOST || apiHost}:${process.env.NEXT_PUBLIC_WS_PORT || apiPort}/graphql`;
