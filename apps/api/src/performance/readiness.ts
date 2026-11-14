/**
 * Process-local readiness flag for graceful shutdown.
 * Liveness remains available; readiness flips false during drain.
 */
let acceptingTraffic = true;

export function isAcceptingTraffic(): boolean {
  return acceptingTraffic;
}

export function stopAcceptingTraffic(): void {
  acceptingTraffic = false;
}

export function startAcceptingTraffic(): void {
  acceptingTraffic = true;
}
