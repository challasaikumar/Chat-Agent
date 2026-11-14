type ConnectionState = "checking" | "connected" | "error";

type ConnectionStatusProps = {
  state: ConnectionState;
  detail?: string;
  onRetry?: () => void;
};

export function ConnectionStatus({
  state,
  detail,
  onRetry,
}: ConnectionStatusProps) {
  const label =
    state === "checking"
      ? "Checking API…"
      : state === "connected"
        ? "API connected"
        : "API unreachable";

  return (
    <div className={`connection connection--${state}`} role="status">
      <span className="connection__dot" aria-hidden />
      <div className="connection__copy">
        <strong>{label}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
      {state === "error" && onRetry ? (
        <button type="button" className="connection__retry" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
