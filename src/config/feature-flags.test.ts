import { describe, expect, it } from "vitest";
import { featureFlags } from "./feature-flags";

describe("featureFlags", () => {
  it("has all flags enabled for launch", () => {
    expect(featureFlags.enablePublicLeagues).toBe(true);
    expect(featureFlags.enablePushNotifications).toBe(true);
    expect(featureFlags.enableCommissionerOverrides).toBe(true);
    expect(featureFlags.enablePlayerComparison).toBe(true);
    expect(featureFlags.enableAdminTools).toBe(true);
    expect(featureFlags.enableDarkMode).toBe(true);
  });
});
