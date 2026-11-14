import { useEffect, useRef } from "react";
import { Square, SendHorizontal } from "lucide-react";

const MAX_CHARS = 12_000;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  onStop: () => void;
  disabled?: boolean;
  generating?: boolean;
  placeholder?: string;
};

export function MessageComposer({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  generating,
  placeholder = "Ask Minimi…",
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <footer className="composer">
      <form
        className="composer__inner"
        onSubmit={(event) => {
          event.preventDefault();
          if (generating) {
            onStop();
            return;
          }
          if (!value.trim() || disabled) return;
          onSend(value);
        }}
      >
        <label className="sr-only" htmlFor="message-input">
          Message
        </label>
        <textarea
          id="message-input"
          ref={ref}
          rows={1}
          value={value}
          maxLength={MAX_CHARS}
          placeholder={placeholder}
          disabled={disabled && !generating}
          aria-label="Message Minimi"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (generating) {
                onStop();
                return;
              }
              if (value.trim() && !disabled) onSend(value);
            }
          }}
        />
        {generating ? (
          <button
            type="submit"
            className="btn"
            aria-label="Stop generation"
            title="Stop generation"
          >
            <Square size={16} />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn--primary"
            disabled={disabled || !value.trim()}
            aria-label="Send message"
          >
            <SendHorizontal size={16} />
            Send
          </button>
        )}
      </form>
      <style>{`
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }
      `}</style>
    </footer>
  );
}
