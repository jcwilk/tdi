export function APIKeyFetcher(): string | null {
  return localStorage.getItem('apiKey');
}

export function APIKeyStorer(key: string): void {
  localStorage.setItem('apiKey', key);
}

export function isAPIKeySet(): boolean {
  return !!APIKeyFetcher();
}
