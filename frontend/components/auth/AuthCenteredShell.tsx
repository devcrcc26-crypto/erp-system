/**
 * Shared chrome for secondary auth routes (forgot password, activate, etc.).
 */
export default function AuthCenteredShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div
      className="flex min-h-dvh w-full flex-col items-center justify-start overflow-y-auto px-4 py-10 sm:px-6"
      style={{
        background:
          'linear-gradient(165deg, #f4f6f8 0%, #e8edf2 48%, #f0f2f5 100%)',
      }}
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
