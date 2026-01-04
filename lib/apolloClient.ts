import { ApolloClient, InMemoryCache, HttpLink, split, ApolloLink, Observable } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { onError } from '@apollo/client/link/error';
import type { ServerError } from '@apollo/client/link/utils';
import { GRAPHQL_HTTP_URL, GRAPHQL_WS_URL } from '@/lib/apiConfig';
import { networkActivity } from '@/lib/networkActivity';
import { notifyAuthInvalidation } from '@/lib/authEvents';

interface StoredSession {
  userId?: string;
  idToken?: string;
}

const STORAGE_KEY = 'riftbound:user';

const getStoredSession = (): StoredSession | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as StoredSession) : null;
  } catch {
    return null;
  }
};

const buildAuthHeaders = (session: StoredSession | null): Record<string, string> => {
  if (!session?.idToken) {
    return {};
  }
  const token = session.idToken;
  return {
    Authorization: `Bearer ${token}`,
    'x-id-token': token,
  };
};

const httpLink = new HttpLink({
  uri: GRAPHQL_HTTP_URL,
  credentials: 'include',
});

const errorLink = onError(({ graphQLErrors, networkError }) => {
  const unauthorizedGraphQL = (graphQLErrors ?? []).some((error) => {
    const code = error.extensions?.code;
    return code === 'UNAUTHENTICATED' || code === 'FORBIDDEN';
  });
  const statusCode =
    (networkError && typeof (networkError as ServerError).statusCode === 'number'
      ? (networkError as ServerError).statusCode
      : null);
  const unauthorizedStatus = statusCode === 401 || statusCode === 403;
  if (unauthorizedGraphQL || unauthorizedStatus) {
    notifyAuthInvalidation();
  }
});

const authLink = setContext((_, { headers }) => {
  const session = getStoredSession();
  const authHeaders = buildAuthHeaders(session);
  if (!Object.keys(authHeaders).length) {
    return { headers };
  }
  return {
    headers: {
      ...headers,
      ...authHeaders,
    },
  };
});

// Create WebSocket link for subscriptions
const wsLink = new GraphQLWsLink(
  createClient({
    url: GRAPHQL_WS_URL,
    connectionParams: () => {
      const session = getStoredSession();
      return buildAuthHeaders(session);
    },
  })
);

const activityLink = new ApolloLink((operation, forward) => {
  if (!forward) {
    return null;
  }
  const { skipNetworkActivity } = operation.getContext?.() ?? {};
  if (skipNetworkActivity) {
    return forward(operation);
  }
  networkActivity.start();
  return new Observable((observer) => {
    const subscription = forward(operation).subscribe({
      next: (result) => observer.next(result),
      error: (error) => {
        networkActivity.stop();
        observer.error(error);
      },
      complete: () => {
        networkActivity.stop();
        observer.complete();
      },
    });
    return () => {
      networkActivity.stop();
      subscription.unsubscribe();
    };
  });
});

const httpWithActivity = ApolloLink.from([errorLink, activityLink, authLink, httpLink]);

// Use wsLink for subscriptions, httpLink for queries and mutations
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpWithActivity
);

// Create Apollo Client instance
export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
    },
  },
});

export default apolloClient;
