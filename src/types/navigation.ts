export interface NavigationItem {
  href: string;
  label: string;
  shortLabel: string;
  requiresAuth?: boolean;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}
