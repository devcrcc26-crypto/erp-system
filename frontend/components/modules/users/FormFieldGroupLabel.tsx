/**
 * Small sub-heading for a group of fields inside one form card
 * (e.g. "Sign-in", "Contact numbers"). `divider` separates it from the group above.
 */
export default function FormFieldGroupLabel({
  children,
  divider = false,
}: {
  children: React.ReactNode;
  divider?: boolean;
}): React.ReactNode {
  return (
    <p
      className={`m-0 mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600${
        divider ? ' mt-2 border-t border-slate-100 pt-5' : ''
      }`}
    >
      {children}
    </p>
  );
}
