import type { ActivationLifecycleNativeAdapter } from './native-adapters.js';
import { createProtocolWake } from './startup-router.js';

export const createProtocolActivationNativeAdapter = ({
  initialArguments,
  protocolScheme
}: {
  initialArguments: readonly string[];
  protocolScheme: string | null;
}): ActivationLifecycleNativeAdapter => ({
  initialWake: () => createProtocolWake(initialArguments, protocolScheme),
  activationFromArguments: (arguments_) =>
    createProtocolWake(arguments_, protocolScheme)
});
