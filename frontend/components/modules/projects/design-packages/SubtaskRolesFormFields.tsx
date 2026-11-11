'use client';

import { Divider, Form, Input, Radio } from 'antd';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';
import type { ApprovalLevel } from '@/lib/api/project-management.types';
import type { SiteRepType } from '@/lib/api/epc.types';
import { reviewTierBilingualLabel } from '@/lib/utils/review-tier-display';
import SubtaskExternalPartiesFormFields from '@/components/modules/projects/design-packages/SubtaskExternalPartiesFormFields';

export default function SubtaskRolesFormFields({
  projectId,
  reviewLevel,
  initialSiteRepType,
  includeExternalParties = true,
}: {
  projectId: string;
  reviewLevel?: ApprovalLevel | null;
  initialSiteRepType?: SiteRepType | null;
  /** When false, only internal role fields are rendered (builder step 2). */
  includeExternalParties?: boolean;
}): React.ReactNode {
  const form = Form.useFormInstance();
  const instituteChiefMode = Form.useWatch('instituteChiefMode', form) ?? 'SYSTEM_USER';

  const showInstituteChief =
    reviewLevel == null || reviewLevel === 'COMPANY_REVIEW';
  const showDisciplineOwner = reviewLevel == null;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Designer (设计)" name="designerUserId">
          <ProjectTeamUserSelect projectId={projectId} memberScope="company_active" />
        </Form.Item>
        <Form.Item label="Supporting designer" name="supportingDesignerUserId">
          <ProjectTeamUserSelect projectId={projectId} memberScope="company_active" />
        </Form.Item>
      </div>
      {showDisciplineOwner ? (
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label={reviewTierBilingualLabel('DISCIPLINE_OWNER')}
            name="disciplineOwnerUserId"
          >
            <ProjectTeamUserSelect projectId={projectId} memberScope="company_active" />
          </Form.Item>
          <Form.Item label={reviewTierBilingualLabel('REVIEWER')} name="reviewerUserId">
            <ProjectTeamUserSelect projectId={projectId} memberScope="company_active" />
          </Form.Item>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label={reviewTierBilingualLabel('REVIEWER')} name="reviewerUserId">
            <ProjectTeamUserSelect projectId={projectId} memberScope="company_active" />
          </Form.Item>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item
          label={reviewTierBilingualLabel('DISCIPLINE_LEAD')}
          name="disciplinaryLeaderUserId"
        >
          <ProjectTeamUserSelect projectId={projectId} memberScope="company_active" />
        </Form.Item>
        <Form.Item
          label={reviewTierBilingualLabel('DEPT_CHIEF')}
          name="deptDeputyChiefUserId"
        >
          <ProjectTeamUserSelect projectId={projectId} memberScope="company_active" />
        </Form.Item>
      </div>
      {showInstituteChief ? (
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label={reviewTierBilingualLabel('INSTITUTE_CHIEF')}
            name="instituteChiefMode"
          >
            <Radio.Group
              options={[
                { label: 'System user', value: 'SYSTEM_USER' },
                { label: 'External person', value: 'EXTERNAL_PERSON' },
              ]}
              optionType="button"
            />
          </Form.Item>
          {instituteChiefMode === 'EXTERNAL_PERSON' ? (
            <Form.Item
              label="External person's name"
              name="instituteChiefName"
              rules={[{ required: true, message: "External person's name is required" }]}
            >
              <Input placeholder="Full name" />
            </Form.Item>
          ) : (
            <Form.Item label="Institute chief" name="instituteChiefUserId">
              <ProjectTeamUserSelect projectId={projectId} memberScope="company_active" />
            </Form.Item>
          )}
        </div>
      ) : null}

      {includeExternalParties ? (
        <>
          <Divider plain>External Parties</Divider>
          <SubtaskExternalPartiesFormFields
            projectId={projectId}
            initialSiteRepType={initialSiteRepType}
          />
        </>
      ) : null}
    </>
  );
}
