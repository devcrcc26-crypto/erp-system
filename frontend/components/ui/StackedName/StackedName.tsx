import { tokens } from '@/lib/theme/tokens';

/**
 * English name with an optional Chinese name stacked below in muted, smaller text.
 */
export default function StackedName({
  name,
  nameZh,
  className = 'font-medium text-slate-900',
  style,
}: {
  name: string;
  nameZh?: string | null;
  className?: string;
  style?: React.CSSProperties;
}): React.ReactNode {
  return (
    <div className="flex flex-col">
      <span className={className} style={style}>
        {name}
      </span>
      {nameZh ? (
        <span style={{ color: tokens.colorTextSecondary, fontSize: 12 }}>
          {nameZh}
        </span>
      ) : null}
    </div>
  );
}
