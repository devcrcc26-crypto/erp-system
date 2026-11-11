'use client';

import { Tag } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { UserProfile } from '@/lib/api/types';
import { formatDateWithPattern } from '@/lib/utils/date-format';
import {
  formatRoleDisplayName,
  getRoleColor,
} from '@/lib/utils/role-colors';
import {
  PROFILE_FIELD_GRID,
  ProfileField,
  ProfileSection,
  displayText,
} from '@/components/modules/profile/profile-display';

/** Picks the Chinese name when the UI is in Chinese and one exists. */
export function localizedName(
  locale: string,
  name: string | null | undefined,
  nameZh: string | null | undefined,
): string {
  if (locale === 'zh' && nameZh?.trim()) {
    return nameZh.trim();
  }
  return displayText(name ?? nameZh);
}

/**
 * Read-only employment record for My Profile, laid out like the HR employee
 * detail overview. Everything here is maintained by HR.
 */
export default function ProfileAccountDetails({
  profile,
}: {
  profile: UserProfile;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const dateFormat = profile.preferredDateFormat;

  const addressParts = [
    profile.addressHouseNumber,
    profile.addressWoreda,
    profile.addressSubcity,
    profile.addressCity,
    profile.addressRegion,
    profile.addressCountry,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  const contacts = profile.emergencyContacts ?? [];
  const assignedRoles = [...(profile.roles ?? [])].sort(
    (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="erp-users-cell-sub m-0">{t('profile.readOnlyHint')}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileSection title={t('profile.sectionIdentity')}>
          <div className={PROFILE_FIELD_GRID}>
            <ProfileField label={t('users.form.firstName')}>
              {displayText(profile.firstName)}
            </ProfileField>
            <ProfileField label={t('users.form.middleName')}>
              {displayText(profile.middleName)}
            </ProfileField>
            <ProfileField label={t('users.form.lastName')}>
              {displayText(profile.lastName)}
            </ProfileField>
            <ProfileField label={t('users.form.chineseName')}>
              {displayText(profile.chineseName)}
            </ProfileField>
            <ProfileField label={t('users.form.employeeId')}>
              {profile.employeeId ? (
                <span className="erp-users-id-chip">{profile.employeeId}</span>
              ) : (
                '-'
              )}
            </ProfileField>
            <ProfileField label={t('users.form.nationality')}>
              {profile.nationality ? t(`hr.nationality.${profile.nationality}`) : '-'}
            </ProfileField>
            <ProfileField label={t('users.form.dateOfBirth')}>
              {formatDateWithPattern(profile.dateOfBirth, dateFormat)}
            </ProfileField>
            <ProfileField label={t('users.form.gender')}>
              {profile.gender ? t(`hr.gender.${profile.gender}`) : '-'}
            </ProfileField>
            <ProfileField label={t('users.form.secondaryPhone')}>
              {displayText(profile.secondaryPhone)}
            </ProfileField>
          </div>
        </ProfileSection>

        <ProfileSection title={t('profile.sectionOrganisation')}>
          <div className={PROFILE_FIELD_GRID}>
            <ProfileField label={t('common.department')}>
              {localizedName(locale, profile.departmentName, profile.departmentNameZh)}
            </ProfileField>
            <ProfileField label={t('common.position')}>
              {localizedName(locale, profile.positionTitle, profile.positionTitleZh)}
            </ProfileField>
            <ProfileField label={t('users.form.seniority')}>
              {profile.seniorityLevelName
                ? localizedName(
                    locale,
                    profile.seniorityLevelName,
                    profile.seniorityLevelNameZh,
                  )
                : '-'}
            </ProfileField>
            <ProfileField label={t('profile.branch')}>
              {displayText(profile.branchName)}
            </ProfileField>
            <ProfileField label={t('users.form.reportsTo')}>
              {profile.reportsToName ? (
                <div>
                  <div className="erp-users-cell-strong">{profile.reportsToName}</div>
                  {profile.reportsToChineseName ? (
                    <div className="erp-users-cell-sub mt-0.5">
                      {profile.reportsToChineseName}
                    </div>
                  ) : null}
                </div>
              ) : (
                '-'
              )}
            </ProfileField>
            <ProfileField label={t('users.form.employeeType')}>
              {profile.employeeType ? t(`hr.employeeType.${profile.employeeType}`) : '-'}
            </ProfileField>
            <ProfileField label={t('users.form.employmentDate')}>
              {formatDateWithPattern(profile.employmentDate, dateFormat)}
            </ProfileField>
          </div>
        </ProfileSection>

        <ProfileSection title={t('profile.sectionAddress')}>
          <div className={PROFILE_FIELD_GRID}>
            <ProfileField label={t('users.form.addressCountry')}>
              {displayText(profile.addressCountry)}
            </ProfileField>
            <ProfileField label={t('users.form.addressRegion')}>
              {displayText(profile.addressRegion)}
            </ProfileField>
            <ProfileField label={t('users.form.addressCity')}>
              {displayText(profile.addressCity)}
            </ProfileField>
            <ProfileField label={t('users.form.addressSubcity')}>
              {displayText(profile.addressSubcity)}
            </ProfileField>
            <ProfileField label={t('users.form.addressWoreda')}>
              {displayText(profile.addressWoreda)}
            </ProfileField>
            <ProfileField label={t('users.form.addressHouseNumber')}>
              {displayText(profile.addressHouseNumber)}
            </ProfileField>
            <ProfileField label={t('users.detailFullAddress')} wide>
              {addressParts.length > 0 ? addressParts.join(', ') : '-'}
            </ProfileField>
          </div>
        </ProfileSection>

        <ProfileSection title={t('profile.sectionEducation')}>
          <div className={PROFILE_FIELD_GRID}>
            <ProfileField label={t('users.form.educationLevel')}>
              {profile.educationLevel
                ? t(`hr.educationLevel.${profile.educationLevel}`)
                : '-'}
            </ProfileField>
            <ProfileField label={t('users.form.fieldOfStudy')}>
              {displayText(profile.fieldOfStudy)}
            </ProfileField>
            <ProfileField label={t('users.form.yearsOfExperience')}>
              {profile.yearsOfExperience != null
                ? t('users.yearsValue', { years: profile.yearsOfExperience })
                : '-'}
            </ProfileField>
          </div>
        </ProfileSection>
      </div>

      <ProfileSection title={t('users.assignedRoles')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {assignedRoles.map((role) => (
            <div
              key={role.id}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Tag
                color={getRoleColor(role.name)}
                style={{
                  margin: 0,
                  fontWeight: role.isPrimary ? 600 : 400,
                }}
              >
                {formatRoleDisplayName(role.name)}
              </Tag>
              {role.isPrimary ? (
                <Tag
                  color="success"
                  style={{ margin: 0, fontSize: 11, borderRadius: 999 }}
                >
                  {t('users.primaryRole')}
                </Tag>
              ) : null}
            </div>
          ))}
          {assignedRoles.length === 0 ? (
            <span
              style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}
            >
              {t('users.noRoleAssigned')}
            </span>
          ) : null}
        </div>
      </ProfileSection>

      <ProfileSection title={t('profile.sectionEmergencyContacts')}>
        {contacts.length === 0 ? (
          <p className="erp-users-cell-sub m-0">{t('profile.noEmergencyContacts')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {contacts.map((contact, index) => {
              const name = [contact.firstName, contact.middleName, contact.lastName]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={`${name}-${index}`} className="erp-employee-contact-card">
                  <div className={PROFILE_FIELD_GRID}>
                    <ProfileField label={t('profile.emergencyName')}>
                      {displayText(name)}
                    </ProfileField>
                    {contact.relationship ? (
                      <ProfileField label={t('profile.emergencyRelationship')}>
                        {contact.relationship}
                      </ProfileField>
                    ) : null}
                    <ProfileField label={t('profile.emergencyPhone')}>
                      {displayText(contact.phone)}
                    </ProfileField>
                    <ProfileField label={t('profile.emergencyEmail')}>
                      {displayText(contact.email)}
                    </ProfileField>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ProfileSection>

      <ProfileSection title={t('profile.sectionPayrollDetails')}>
        <div className={PROFILE_FIELD_GRID}>
          <ProfileField label={t('users.form.bankName')}>
            {displayText(profile.bankName)}
          </ProfileField>
          <ProfileField label={t('users.form.bankBranch')}>
            {displayText(profile.bankBranch)}
          </ProfileField>
          <ProfileField label={t('users.form.bankAccountNumber')}>
            {displayText(profile.bankAccountNumber)}
          </ProfileField>
        </div>
      </ProfileSection>
    </div>
  );
}
