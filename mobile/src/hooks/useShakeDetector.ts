/**
 * useShakeDetector
 *
 * Subscribes to the device accelerometer and fires `onShake` when a shake
 * gesture is detected. Magnitude threshold and cooldown are configurable.
 *
 * Uses a ref for the callback so the accelerometer subscription is only
 * created/destroyed when threshold or cooldownMs change, not on every render.
 */

import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';

interface Options {
  threshold?: number;   // g-force threshold to count as a shake (default 2.2)
  cooldownMs?: number;  // ms between consecutive shake triggers (default 1500)
  onShake: () => void;
}

export function useShakeDetector({
  threshold = 2.2,
  cooldownMs = 1500,
  onShake,
}: Options) {
  const lastShake = useRef<number>(0);
  const lastValues = useRef({ x: 0, y: 0, z: 0 });
  // Keep a ref so the subscription doesn't restart on every onShake identity change
  const onShakeRef = useRef(onShake);
  useEffect(() => { onShakeRef.current = onShake; });

  useEffect(() => {
    Accelerometer.setUpdateInterval(80);

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const dx = Math.abs(x - lastValues.current.x);
      const dy = Math.abs(y - lastValues.current.y);
      const dz = Math.abs(z - lastValues.current.z);
      lastValues.current = { x, y, z };

      const delta = dx + dy + dz;
      const now = Date.now();

      if (delta > threshold && now - lastShake.current > cooldownMs) {
        lastShake.current = now;
        onShakeRef.current();
      }
    });

    return () => sub.remove();
  }, [threshold, cooldownMs]); // onShake intentionally excluded — handled via ref
}
