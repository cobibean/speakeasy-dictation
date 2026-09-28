import type { OperatingPlatform } from '../../shared/platform.js';

export const getVisibleStepCount = (platform: OperatingPlatform): 9 | 11 =>
  platform === 'macos' ? 11 : 9;

export const toVisibleSetupStep = ({
  canonicalStep,
  platform,
  accessibilityReady
}: {
  canonicalStep: number;
  platform: OperatingPlatform;
  accessibilityReady: boolean;
}): number => {
  if (platform !== 'macos' || canonicalStep <= 4) return canonicalStep;
  if (canonicalStep === 5 && !accessibilityReady) return 5;
  return canonicalStep + 1;
};

export const toCanonicalSetupStep = (
  visibleStep: number,
  platform: OperatingPlatform
): number | null => {
  if (platform !== 'macos') return visibleStep;
  if (visibleStep === 5 || visibleStep === 10) return null;
  if (visibleStep === 11) return 9;
  return visibleStep <= 4 ? visibleStep : visibleStep - 1;
};

export const getPlatformSetupSteps = (platform: OperatingPlatform) => ({
  accessibility: platform === 'macos' ? 5 : null,
  hotkeyChoice: platform === 'macos' ? 6 : 5,
  hotkeyVerification: platform === 'macos' ? 7 : 6,
  practiceCoaching: platform === 'macos' ? 8 : 7,
  nativePasteProof: platform === 'macos' ? 9 : 8,
  planSelection: platform === 'macos' ? 10 : null,
  ready: platform === 'macos' ? 11 : 9
});
