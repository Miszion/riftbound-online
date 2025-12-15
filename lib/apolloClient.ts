import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

// Determine the API URLs based on environment
const apiHost = process.env.NEXT_PUBLIC_API_HOST || 'localhost';
const apiPort = process.env.NEXT_PUBLIC_API_PORT || '3000';
const wsHost = process.env.NEXT_PUBLIC_WS_HOST || apiHost;
const wsPort = process.env.NEXT_PUBLIC_WS_PORT || apiPort;

const httpLink = new HttpLink({
  uri: `http://${apiHost}:${apiPort}/graphql`,
  credentials: 'include',
});

// Create WebSocket link for subscriptions
const wsLink = new GraphQLWsLink(
  createClient({
    url: `ws://${wsHost}:${wsPort}/graphql`,
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
  httpLink
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
