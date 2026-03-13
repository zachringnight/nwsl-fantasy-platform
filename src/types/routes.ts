export interface AsyncRouteProps<T extends Record<string, string>> {
  params: Promise<T>;
}
