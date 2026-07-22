export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div
      className="flex min-h-dvh w-full items-start justify-center overflow-x-hidden px-4 py-6 sm:items-center sm:px-6 sm:py-10"
      style={{ backgroundColor: '#f1f5f9' }}
    >
      {children}
    </div>
  );
}
