type Props = {
  onNewChat: () => void;
};

export function EmptyState({ onNewChat }: Props) {
  return (
    <div className="empty-state">
      <h3>Research with evidence</h3>
      <p>
        Ask about current pricing, product releases, or whether something changed
        since your last conversation. Minimi searches the web, verifies sources,
        and cites what it finds.
      </p>
      <button type="button" className="btn btn--primary" onClick={onNewChat}>
        Start a conversation
      </button>
    </div>
  );
}
