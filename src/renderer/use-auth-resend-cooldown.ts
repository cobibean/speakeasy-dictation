import { useEffect, useState } from 'react';
import { authResendSecondsRemaining } from '../shared/auth-resend';

export const useAuthResendCooldown = (availableAt?: number): number => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!authResendSecondsRemaining(availableAt)) return;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (!authResendSecondsRemaining(availableAt, currentTime)) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [availableAt]);
  return Math.min(60, authResendSecondsRemaining(availableAt, now));
};
