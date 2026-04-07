export const featureFlags = {
  enablePublicLeagues: true,
  enablePushNotifications: false,
  enableCommissionerOverrides: true,
  enablePlayerComparison: true,
  enableAdminTools: process.env.NEXT_PUBLIC_ENABLE_ADMIN === "true",
  enableDarkMode: true,
} as const;
