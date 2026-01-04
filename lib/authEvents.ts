type AuthInvalidationListener = () => void;

const listeners = new Set<AuthInvalidationListener>();

export const subscribeToAuthInvalidation = (listener: AuthInvalidationListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const notifyAuthInvalidation = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('[AUTH] Failed to handle invalidation callback', error);
    }
  });
};
