import {
  detectClaimConflicts,
  type ContradictionClaim,
} from "../claims/claim.contradiction.detector.js";
import type { DetectedConflict } from "../evidence.types.js";

export class ConflictDetector {
  detect(claims: ContradictionClaim[]): DetectedConflict[] {
    return detectClaimConflicts(claims);
  }
}
