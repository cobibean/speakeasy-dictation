export const extractProtocolUrl = (
  argv: readonly string[],
  protocolScheme: string | null
): string | null =>
  protocolScheme
    ? argv.find((value) => value.startsWith(`${protocolScheme}://`)) ?? null
    : null;

export const shouldRecoverHotkeyOnPowerEvents = (
  platform: NodeJS.Platform
): boolean => platform === 'win32';

export const getWindowsAppUserModelId = (
  edition: 'oss' | 'product'
): string => edition === 'product' ? 'com.speakeasy.app' : 'com.speakeasy.oss';
