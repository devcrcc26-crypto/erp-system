export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center p-4"
      style={{ backgroundColor: '#f1f5f9' }}
    >
      {children}
    </div>
  );
}
