'use client';

import { ReactNode } from 'react';
import { ApolloProvider } from '@apollo/client';
import apolloClient from '@/lib/apolloClient';
import { AuthProvider } from '@/components/auth/AuthProvider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ApolloProvider client={apolloClient}>
      <AuthProvider>{children}</AuthProvider>
    </ApolloProvider>
  );
}

export default Providers;
