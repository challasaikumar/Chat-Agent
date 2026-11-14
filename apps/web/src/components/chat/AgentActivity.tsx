type Props = {
  message: string | null;
  visible: boolean;
};

export function AgentActivity({ message, visible }: Props) {
  if (!visible || !message) return null;
  return (
    <div className="agent-activity" role="status" aria-live="polite">
      <span className="agent-activity__dot" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
