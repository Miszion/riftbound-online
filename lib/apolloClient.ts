import { ApolloClient, InMemoryCache, HttpLink, split, ApolloLink, Observable } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { GRAPHQL_HTTP_URL, GRAPHQL_WS_URL } from '@/lib/apiConfig';
import { networkActivity } from '@/lib/networkActivity';

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

const activityLink = new ApolloLink((operation, forward) => {
  if (!forward) {
    return null;
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

const httpWithActivity = ApolloLink.from([activityLink, authLink, httpLink]);

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
