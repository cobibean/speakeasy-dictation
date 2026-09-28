import {
  bootstrapProductSession,
  reconcileHostedOperationOutbox
} from './product-api.js';
import {
  getHostedAuthSnapshot,
  getProductAccessToken,
  type HostedAuthSnapshot
} from './product-auth.js';
import {
  getAccessibilityPermission,
  getMicrophonePermission
} from './platform-service.js';
import { getPlatformState } from './platform-service.js';
import { getStore } from './store.js';
import {
  reconcileSetupBootstrap,
  resolveSetupPresentation,
  type ResumeCheckpoint,
  type SetupBootstrapResult
} from '../shared/setup-bootstrap.js';
import type { ProductSessionBootstrapResponse } from '../shared/product-api.js';

export interface HostedSetupBootstrapState {
  auth: HostedAuthSnapshot;
  setup: SetupBootstrapResult;
  server: ProductSessionBootstrapResponse | null;
  mode: 'first-run' | 'review' | 'recovery';
  device: {
    microphoneStatus: ReturnType<typeof getMicrophonePermission>;
    accessibilityStatus: ReturnType<typeof getAccessibilityPermission>;
    operatingSystem: ReturnType<typeof getPlatformState>['operatingSystem'];
    hotkeyId: string;
    hotkeyVerified: boolean;
  };
  canClose: boolean;
  requestedStep: number | null;
}

const signedOutResult = (): SetupBootstrapResult => ({
  destination: 'onboarding',
  earliestIncompleteStep: getStore().get('onboardingWelcomeCompleted') ? 2 : 1,
  reason: 'account-required'
});

const localState = (setup: SetupBootstrapResult) => {
  const store = getStore();
  return {
    ...resolveSetupPresentation({
      reviewRequested: store.get('setupReviewRequested'),
      recoveryStep: store.get('setupRecoveryStep'),
      setup
    }),
    device: {
      microphoneStatus: getMicrophonePermission(),
      accessibilityStatus: getAccessibilityPermission(),
      operatingSystem: getPlatformState().operatingSystem,
      hotkeyId: store.get('hotkey'),
      hotkeyVerified: store.get('hotkeyVerified')
    },
    canClose: store.get('setupCompletedOnce')
  };
};

const readResumeCheckpoint = (): ResumeCheckpoint | null => {
  const value = getStore().get('resumeCheckpoint');
  if (!value) return null;
  try {
    const checkpoint = JSON.parse(value) as ResumeCheckpoint;
    return checkpoint &&
      typeof checkpoint.setupId === 'string' &&
      typeof checkpoint.enrollmentId === 'string' &&
      Number.isInteger(checkpoint.lastIncompleteStep)
      ? checkpoint
      : null;
  } catch {
    getStore().set('resumeCheckpoint', '');
    return null;
  }
};

const saveResumeCheckpoint = (
  server: ProductSessionBootstrapResponse,
  setup: SetupBootstrapResult
): void => {
  if (setup.earliestIncompleteStep === null) {
    getStore().set('resumeCheckpoint', '');
    return;
  }
  const checkpoint: ResumeCheckpoint = {
    setupId: server.accountDeviceSetup.setupId,
    enrollmentId: server.enrollment.enrollmentId,
    lastIncompleteStep: setup.earliestIncompleteStep
  };
  getStore().set('resumeCheckpoint', JSON.stringify(checkpoint));
};

export const resolveHostedSetupBootstrap =
  async (): Promise<HostedSetupBootstrapState> => {
    const auth = getHostedAuthSnapshot();
    try {
      await getProductAccessToken();
    } catch {
      const setup = signedOutResult();
      return { auth, setup, server: null, ...localState(setup) };
    }

    const server = await bootstrapProductSession();
    await reconcileHostedOperationOutbox();
    const checkpoint = readResumeCheckpoint();
    const setup = reconcileSetupBootstrap({
      accountState: server.accountState,
      deviceState: {
        installationId: getStore().get('deviceId'),
        microphoneReady: getMicrophonePermission() === 'granted',
        hotkeyId: getStore().get('hotkey') || null,
        hotkeyVerified: getStore().get('hotkeyVerified') ?? false
      },
      enrollment: server.enrollment,
      accountDeviceSetup: server.accountDeviceSetup,
      resumeCheckpoint:
        checkpoint?.setupId === server.accountDeviceSetup.setupId &&
        checkpoint.enrollmentId === server.enrollment.enrollmentId
          ? checkpoint
          : null
    });
    saveResumeCheckpoint(server, setup);
    if (setup.destination === 'hud') {
      getStore().set('setupCompletedOnce', true);
    }
    return { auth: getHostedAuthSnapshot(), setup, server, ...localState(setup) };
  };
