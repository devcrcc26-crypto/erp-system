'use client';

import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { CommentSeverity } from '@/lib/api/epc.types';
import {
  COMMENT_SEVERITY_LABELS,
  COMMENT_SEVERITY_VARIANTS,
} from '@/lib/utils/epc-display';

export default function CommentSeverityTag({
  severity,
}: {
  severity: CommentSeverity | string;
}): React.ReactNode {
  const normalized = severity as CommentSeverity;
  const variant = COMMENT_SEVERITY_VARIANTS[normalized] ?? 'default';
  const label = COMMENT_SEVERITY_LABELS[normalized] ?? severity;

  return <StatusBadge label={label} variant={variant} />;
}
