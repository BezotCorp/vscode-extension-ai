export type ProviderStatus = {
  status: 'connected' | 'disconnected' | 'connecting';
  text: string;
  providerUrl: string;
};
