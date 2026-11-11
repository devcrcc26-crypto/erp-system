'use client';

import { Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { avatarTint, userInitials } from '@/lib/utils/avatar-tint';

/**
 * Employee identity cell for HR list tables - the Employees list look
 * (tinted initials tile, name, email underneath). Styled by
 * `employees-v2.css` when the page root has `erp-employees-v2`.
 */
export default function HrPersonCell({
  person,
  name,
  sub,
}: {
  person?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  /** Display name, already formatted by the module's helper. */
  name: string;
  /** Second line; defaults to the person's email. */
  sub?: React.ReactNode;
}): React.ReactNode {
  // Fall back to the display name when only that is known.
  const nameParts = name.trim().split(/\s+/);
  const initials =
    userInitials(person?.firstName, person?.lastName) ||
    userInitials(nameParts[0], nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');
  const tint = avatarTint(person?.id ?? name);
  const secondLine = sub ?? person?.email ?? null;

  return (
    <div className="erp-users-person">
      <Avatar
        size={40}
        shape="square"
        className="erp-users-avatar shrink-0"
        icon={initials ? undefined : <UserOutlined />}
        style={{
          backgroundColor: tint.bg,
          color: tint.fg,
          fontSize: 13,
          fontWeight: 600,
        }}
        aria-hidden
      >
        {initials}
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="erp-users-name m-0 truncate" title={name}>
          {name}
        </p>
        {secondLine ? (
          <p className="erp-users-email m-0 mt-0.5 truncate">{secondLine}</p>
        ) : null}
      </div>
    </div>
  );
}
