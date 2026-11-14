import { Link } from "react-router-dom";

export function UnauthorizedPage() {
  return (
    <main className="login-page">
      <div className="login-form">
        <h1>Access denied</h1>
        <p className="login-form__lede">
          You do not have permission to view this page.
        </p>
        <Link to="/login">Back to sign in</Link>
      </div>
    </main>
  );
}
