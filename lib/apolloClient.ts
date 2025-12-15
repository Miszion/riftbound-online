import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { GRAPHQL_HTTP_URL, GRAPHQL_WS_URL } from '@/lib/apiConfig';

const httpLink = new HttpLink({
  uri: GRAPHQL_HTTP_URL,
  credentials: 'include',
});

const authLink = setContext((_, { headers }) => {
  if (typeof window === 'undefined') {
    return { headers };
  }
  try {
    const stored = window.localStorage.getItem('riftbound:user');
    if (!stored) {
      return { headers };
    }
    const session = JSON.parse(stored);
    if (!session?.userId) {
      return { headers };
    }
    return {
      headers: {
        ...headers,
        'x-user-id': session.userId,
      },
    };
  } catch {
    return { headers };
  }
});

// Create WebSocket link for subscriptions
const wsLink = new GraphQLWsLink(
  createClient({
    url: GRAPHQL_WS_URL,
    connectionParams: () => {
      if (typeof window === 'undefined') {
        return {};
      }
      try {
        const stored = window.localStorage.getItem('riftbound:user');
        if (!stored) {
          return {};
        }
        const session = JSON.parse(stored);
        return session?.userId ? { 'x-user-id': session.userId } : {};
      } catch {
        return {};
      }
    },
  })
);

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
  authLink.concat(httpLink)
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
