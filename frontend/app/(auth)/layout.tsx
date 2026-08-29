export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return <div className="min-h-dvh w-full">{children}</div>;
}
