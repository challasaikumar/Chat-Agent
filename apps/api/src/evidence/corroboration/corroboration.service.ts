import { evaluateCorroboration } from "./corroboration.engine.js";
import type {
  CorroborationInput,
  CorroborationResult,
} from "./corroboration.types.js";

export class CorroborationService {
  evaluate(input: CorroborationInput): CorroborationResult {
    return evaluateCorroboration(input);
  }
}
