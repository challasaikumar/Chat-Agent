/**
 * Incrementally extracts the JSON `answer` string from a streaming
 * structured final-answer payload without a fragile full JSON parse.
 *
 * Only emits decoded answer characters — never raw JSON braces/keys.
 */

export class AnswerJsonExtractor {
  private buffer = "";
  private mode: "seeking" | "in_string" | "done" = "seeking";
  private escapeNext = false;
  private emitted = "";

  /**
   * Feed a raw output_text delta. Returns the newly decoded answer slice
   * (empty string when still seeking the answer field).
   */
  push(rawDelta: string): string {
    if (this.mode === "done" || !rawDelta) {
      return "";
    }

    this.buffer += rawDelta;
    let out = "";

    if (this.mode === "seeking") {
      const match = this.buffer.match(/"answer"\s*:\s*"/);
      if (!match || match.index === undefined) {
        // Keep a bounded seek window.
        if (this.buffer.length > 8_000) {
          this.buffer = this.buffer.slice(-4_000);
        }
        return "";
      }
      const start = match.index + match[0].length;
      this.buffer = this.buffer.slice(start);
      this.mode = "in_string";
    }

    for (let i = 0; i < this.buffer.length; i += 1) {
      const ch = this.buffer[i]!;
      if (this.escapeNext) {
        out += unescapeChar(ch);
        this.escapeNext = false;
        continue;
      }
      if (ch === "\\") {
        this.escapeNext = true;
        continue;
      }
      if (ch === '"') {
        this.mode = "done";
        this.buffer = this.buffer.slice(i + 1);
        break;
      }
      out += ch;
    }

    if (this.mode === "in_string") {
      this.buffer = "";
    }

    this.emitted += out;
    return out;
  }

  getAnswer(): string {
    return this.emitted;
  }

  isComplete(): boolean {
    return this.mode === "done";
  }
}

function unescapeChar(ch: string): string {
  switch (ch) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "r":
      return "\r";
    case '"':
      return '"';
    case "\\":
      return "\\";
    case "/":
      return "/";
    default:
      return ch;
  }
}
