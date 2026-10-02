export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return <div className="h-full w-full overflow-y-auto">{children}</div>;
}
