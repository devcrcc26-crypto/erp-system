export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div
      className="flex min-h-dvh w-full flex-col items-center justify-start overflow-y-auto px-4 py-10 sm:px-6"
      style={{ backgroundColor: '#f1f5f9' }}
    >
      {children}
    </div>
  );
}
