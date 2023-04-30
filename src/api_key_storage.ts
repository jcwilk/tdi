export const APIKeyFetcher = (): string | null => {
  return localStorage.getItem('apiKey');
}

export const APIKeyStorer = (key: string): void => {
  localStorage.setItem('apiKey', key);
}
