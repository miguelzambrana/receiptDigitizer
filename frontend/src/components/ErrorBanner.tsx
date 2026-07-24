/**
 * Reusable inline error banner. Renders nothing when there's no message, so
 * call sites can keep their existing `error && <ErrorBanner .../>`-free
 * usage (`<ErrorBanner message={error} />` unconditionally) or the guarded
 * form — both work identically since the component itself no-ops on a
 * falsy message. Keeps the `role="alert"` contract screen readers (and
 * existing tests) rely on.
 */
export default function ErrorBanner({
  message,
}: {
  message: string | null | undefined;
}) {
  if (!message) return null;

  return (
    <p className="error-banner" role="alert">
      {message}
    </p>
  );
}
