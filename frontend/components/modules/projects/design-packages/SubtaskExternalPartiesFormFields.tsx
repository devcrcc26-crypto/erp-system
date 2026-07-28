'use client';

import { useEffect, useState } from 'react';
import { Form, Input, Radio } from 'antd';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';
import type { SiteRepType } from '@/lib/api/epc.types';

export default function SubtaskExternalPartiesFormFields({
  projectId,
  initialSiteRepType,
}: {
  projectId: string;
  initialSiteRepType?: SiteRepType | null;
}): React.ReactNode {
  const form = Form.useFormInstance();
  const [siteRepType, setSiteRepType] = useState<SiteRepType>(
    initialSiteRepType ?? 'EXTERNAL',
  );

  useEffect(() => {
    const next = initialSiteRepType ?? 'EXTERNAL';
    setSiteRepType(next);
    form.setFieldValue('siteRepType', next);
  }, [initialSiteRepType, form]);

  function handleSiteRepTypeChange(value: SiteRepType): void {
    setSiteRepType(value);
    form.setFieldValue('siteRepType', value);
    if (value === 'EXTERNAL') {
      form.setFieldValue('siteRepresentativeUserId', null);
    } else {
      form.setFieldValue('siteRepName', null);
      form.setFieldValue('siteRepEmail', null);
      form.setFieldValue('siteRepPhone', null);
      form.setFieldValue('siteRepCompany', null);
    }
  }

  return (
    <>
      <Form.Item name="siteRepType" hidden>
        <Input />
      </Form.Item>

      <Form.Item label="Site Representative">
        <div className="flex flex-col gap-3">
          <Radio.Group
            value={siteRepType}
            onChange={(event) =>
              handleSiteRepTypeChange(event.target.value as SiteRepType)
            }
          >
            <Radio value="EXTERNAL">External (contractor)</Radio>
            <Radio value="INTERNAL">Internal (CCECC staff)</Radio>
          </Radio.Group>

          {siteRepType === 'EXTERNAL' ? (
            <div className="flex flex-col gap-2 pl-1">
              <Form.Item name="siteRepName" label="Full Name" className="mb-0">
                <Input placeholder="e.g. Ato Bekele Tadesse" />
              </Form.Item>
              <Form.Item name="siteRepCompany" label="Company" className="mb-0">
                <Input placeholder="e.g. Westgate Contracting" />
              </Form.Item>
              <Form.Item name="siteRepPhone" label="Phone" className="mb-0">
                <Input placeholder="+251 9XX XXX XXX" />
              </Form.Item>
              <Form.Item name="siteRepEmail" label="Email" className="mb-0">
                <Input placeholder="contact@contractor.com" />
              </Form.Item>
            </div>
          ) : (
            <Form.Item name="siteRepresentativeUserId" className="mb-0">
              <ProjectTeamUserSelect
                projectId={projectId}
                memberScope="company_active"
                placeholder="Select CCECC staff member"
                allowClear
              />
            </Form.Item>
          )}
        </div>
      </Form.Item>

      <p className="mb-2 text-xs text-[var(--color-text-tertiary)]">
        External consultant who reviews documents before external release. Always
        external.
      </p>
      <Form.Item name="consultantName" label="Full Name">
        <Input placeholder="e.g. Eng. Yohannes Bekele" />
      </Form.Item>
      <Form.Item name="consultantTitle" label="Title / Discipline">
        <Input placeholder="e.g. Structural Engineer, ERA" />
      </Form.Item>
      <Form.Item name="consultantCompany" label="Company">
        <Input placeholder="e.g. Ethiopian Roads Authority" />
      </Form.Item>
      <Form.Item name="consultantPhone" label="Phone">
        <Input placeholder="+251 9XX XXX XXX" />
      </Form.Item>
      <Form.Item name="consultantEmail" label="Email">
        <Input placeholder="consultant@era.gov.et" />
      </Form.Item>
    </>
  );
}
