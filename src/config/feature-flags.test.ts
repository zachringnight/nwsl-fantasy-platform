import { describe, expect, it } from "vitest";
import { featureFlags } from "./feature-flags";

describe("featureFlags", () => {
  it("has expected flag values", () => {
    expect(featureFlags.enablePublicLeagues).toBe(true);
    expect(featureFlags.enablePushNotifications).toBe(false);
    expect(featureFlags.enableCommissionerOverrides).toBe(true);
    expect(featureFlags.enablePlayerComparison).toBe(true);
    expect(featureFlags.enableDarkMode).toBe(true);
  });
});
