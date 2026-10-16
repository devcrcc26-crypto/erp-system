import {
  AlarmClock,
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  DoorOpen,
  FilePen,
  Info,
  LogIn,
  LogOut,
  MapPin,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type {
  AttendanceDayFlag,
  FieldMovementExplanationStatus,
  FieldMovementReason,
  FieldMovementStatus,
} from '@/lib/api/attendance.types';
import type { FieldMovementIssueType } from '@/lib/generated/field-movement-issue-compatibility';
import './field-movement.css';

/**
 * Labels, icons and badges shared by the field movement request form and the
 * HR log pages. Badge colours come from the --fm-* tokens in field-movement.css,
 * so any page using these must sit inside a `.fm-page` wrapper.
 */

export const REASON_LABELS: Record<FieldMovementReason, string> = {
  FIELD_VISIT: 'Field visit',
  EARLY_LEAVE: 'Left early',
  FORGOT_CLOCK_IN: 'Forgot to clock in',
  FORGOT_CLOCK_OUT: 'Forgot to clock out',
};

export const REASON_ICONS: Record<FieldMovementReason, LucideIcon> = {
  FIELD_VISIT: MapPin,
  EARLY_LEAVE: DoorOpen,
  FORGOT_CLOCK_IN: AlarmClock,
  FORGOT_CLOCK_OUT: AlarmClock,
};

export const FLAG_LABELS: Record<AttendanceDayFlag, string> = {
  MISSING_CLOCK_IN: 'Missing clock-in',
  MISSING_CLOCK_OUT: 'Missing clock-out',
  EARLY_LEAVE: 'Early departure detected',
  ON_LEAVE_BUT_SCANNED: 'On leave but scanned',
  SCAN_AFTER_SEPARATION: 'Scanned after leaving date',
  NONE: '',
};

export const FLAG_TONES: Record<AttendanceDayFlag, string> = {
  MISSING_CLOCK_IN: 'red',
  MISSING_CLOCK_OUT: 'amber',
  EARLY_LEAVE: 'coral',
  ON_LEAVE_BUT_SCANNED: 'violet',
  SCAN_AFTER_SEPARATION: 'neutral',
  NONE: 'neutral',
};

const FLAG_ICONS: Record<AttendanceDayFlag, LucideIcon> = {
  MISSING_CLOCK_IN: LogIn,
  MISSING_CLOCK_OUT: LogOut,
  EARLY_LEAVE: DoorOpen,
  ON_LEAVE_BUT_SCANNED: LogIn,
  SCAN_AFTER_SEPARATION: Info,
  NONE: Info,
};

const STATUS_DISPLAY: Record<
  FieldMovementStatus,
  { label: string; tone: string; icon: LucideIcon }
> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: FilePen },
  SUBMITTED: { label: 'Submitted', tone: 'blue', icon: Clock },
  IN_REVIEW: { label: 'In review', tone: 'blue', icon: Clock },
  APPROVED: { label: 'Approved', tone: 'green', icon: CircleCheck },
  REJECTED: { label: 'Rejected', tone: 'red', icon: CircleX },
  RETURNED: { label: 'Returned', tone: 'amber', icon: Undo2 },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: Ban },
};

export function formatFieldMovementStatus(status: FieldMovementStatus): string {
  return STATUS_DISPLAY[status]?.label ?? status;
}

export const ISSUE_TYPE_LABELS: Record<FieldMovementIssueType, string> = {
  MISSING_CLOCK_OUT: 'Missing clock-out',
  MISSING_CLOCK_IN: 'Missing clock-in',
  EARLY_DEPARTURE: 'Early departure',
  NO_SCANS: 'No scans',
};

const EXPLANATION_STATUS_DISPLAY: Record<
  FieldMovementExplanationStatus,
  { label: string; tone: string }
> = {
  NOT_EXPLAINED: { label: 'Not explained', tone: 'amber' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'blue' },
  APPROVED: { label: 'Approved', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  RETURNED: { label: 'Returned', tone: 'amber' },
};

export function IssueTypeBadge({
  issueType,
}: {
  issueType: FieldMovementIssueType;
}): React.ReactNode {
  return (
    <span className="fm-badge fm-badge--neutral">
      {ISSUE_TYPE_LABELS[issueType]}
    </span>
  );
}

export function ExplanationStatusBadge({
  status,
}: {
  status: FieldMovementExplanationStatus;
}): React.ReactNode {
  const display = EXPLANATION_STATUS_DISPLAY[status] ?? {
    label: status,
    tone: 'neutral',
  };
  return (
    <span className={`fm-badge fm-badge--${display.tone}`}>
      {display.label}
    </span>
  );
}

export function ScanTimes({
  clockIn,
  clockOut,
}: {
  clockIn: string | null;
  clockOut: string | null;
}): React.ReactNode {
  return (
    <span className="fm-scan-times">
      <span>{clockIn ?? '-'}</span>
      <span aria-hidden> / </span>
      <span>{clockOut ?? '-'}</span>
    </span>
  );
}

export function FlagBadge({ flag }: { flag: AttendanceDayFlag }): React.ReactNode {
  const Icon = FLAG_ICONS[flag];
  return (
    <span className={`fm-badge fm-badge--${FLAG_TONES[flag]}`}>
      <Icon size={13} aria-hidden />
      {FLAG_LABELS[flag]}
    </span>
  );
}

export function ReasonBadge({
  reason,
}: {
  reason: FieldMovementReason;
}): React.ReactNode {
  const Icon = REASON_ICONS[reason] ?? Info;
  return (
    <span className="fm-badge fm-badge--green">
      <Icon size={13} aria-hidden />
      {REASON_LABELS[reason] ?? reason}
    </span>
  );
}

export function FieldMovementStatusBadge({
  status,
}: {
  status: FieldMovementStatus;
}): React.ReactNode {
  const display = STATUS_DISPLAY[status] ?? {
    label: status,
    tone: 'neutral',
    icon: Info,
  };
  const Icon = display.icon;
  return (
    <span className={`fm-badge fm-badge--${display.tone}`}>
      <Icon size={13} aria-hidden />
      {display.label}
    </span>
  );
}

/**
 * Day-number / month tile used on day cards.
 */
export function DateTile({ date }: { date: string }): React.ReactNode {
  const value = new Date(date);
  return (
    <div className="fm-day__date" aria-hidden>
      <span className="fm-day__date-num">{value.getDate()}</span>
      <span className="fm-day__date-mon">
        {value.toLocaleDateString('en-GB', { month: 'short' })}
      </span>
    </div>
  );
}

export function formatLongDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
