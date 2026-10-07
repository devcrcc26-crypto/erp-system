'use client';

import '../announcements.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import {
  Alert,
  Button,
  Collapse,
  DatePicker,
  Form,
  Input,
  Popconfirm,
  Radio,
  Select,
  Switch,
  Tabs,
  Upload,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { Paperclip, Users, X } from 'lucide-react';
import dayjs, { type Dayjs } from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanPublishAnnouncements } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  AnnouncementPriority,
  AnnouncementScope,
  AnnouncementType,
  AnnouncementWritePayload,
  ManagedAnnouncementDetail,
} from '@/lib/api/announcements.types';
import {
  useAnnouncementAudienceCount,
  useAnnouncementAudienceOptions,
  useCreateAnnouncement,
  useDeleteAnnouncementAttachment,
  usePublishAnnouncement,
  announcementKeys,
  uploadAnnouncementFiles,
  useUpdateAnnouncement,
} from '@/lib/query/announcements';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';
import AnnouncementMarkdown from '../AnnouncementMarkdown';
import { formatFileSize, priorityLabelKey, scopeLabelKey } from '../announcement-display';

interface FormValues {
  title: string;
  titleZh?: string;
  body: string;
  bodyZh?: string;
  priority: AnnouncementPriority;
  audienceScope: AnnouncementScope;
  departmentIds: string[];
  disciplineIds: string[];
  roleIds: string[];
  employeeIds: string[];
  requireAcknowledgement: boolean;
  sendEmail: boolean;
  pinned: boolean;
  publishMode: 'now' | 'schedule';
  publishAt: Dayjs | null;
  expiresAt: Dayjs | null;
}

const PRIORITIES: AnnouncementPriority[] = ['NORMAL', 'IMPORTANT', 'URGENT'];
const SCOPES: AnnouncementScope[] = ['ALL', 'DEPARTMENTS', 'DISCIPLINES', 'ROLES', 'EMPLOYEES'];

function MarkdownEditor({
  value,
  onChange,
  placeholder,
  id,
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  id?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  return (
    <div className="erp-ann-editor">
      <Tabs
        size="small"
        items={[
          {
            key: 'write',
            label: t('announcements.form.write'),
            children: (
              <Input.TextArea
                id={id}
                value={value}
                onChange={(event) => onChange?.(event.target.value)}
                autoSize={{ minRows: 9, maxRows: 24 }}
                placeholder={placeholder}
                maxLength={20000}
              />
            ),
          },
          {
            key: 'preview',
            label: t('announcements.form.preview'),
            children: (
              <div className="erp-ann-editor-preview">
                {value?.trim() ? (
                  <AnnouncementMarkdown source={value} />
                ) : (
                  <p className="m-0 text-[#4b5563]">{t('announcements.form.previewEmpty')}</p>
                )}
              </div>
            ),
          },
        ]}
      />
      <p className="erp-ann-editor-hint">{t('announcements.form.markdownHint')}</p>
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked?: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}): React.ReactNode {
  return (
    <div className="erp-ann-switch-row">
      <div>
        <p>{label}</p>
        <p>{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

/**
 * Create / edit an announcement. After publishing only the content, pin and
 * expiry can change; the audience and delivery options are locked.
 */
export default function AnnouncementForm({
  existing,
  initialType = 'COMPANY',
}: {
  existing?: ManagedAnnouncementDetail;
  initialType?: AnnouncementType;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canPublish = useCanPublishAnnouncements();
  const [form] = Form.useForm<FormValues>();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const type: AnnouncementType = existing?.type ?? initialType;
  const isSystem = type === 'SYSTEM_UPDATE';
  const published = existing?.status === 'PUBLISHED';
  const locked = published;

  const createMutation = useCreateAnnouncement();
  const updateMutation = useUpdateAnnouncement(existing?.id ?? '');
  const publishMutation = usePublishAnnouncement();
  const queryClient = useQueryClient();
  const deleteAttachment = useDeleteAnnouncementAttachment(existing?.id ?? '');
  const options = useAnnouncementAudienceOptions(!isSystem);

  const scope = Form.useWatch('audienceScope', form) ?? existing?.audienceScope ?? 'ALL';
  const departmentIds = Form.useWatch('departmentIds', form);
  const disciplineIds = Form.useWatch('disciplineIds', form);
  const roleIds = Form.useWatch('roleIds', form);
  const employeeIds = Form.useWatch('employeeIds', form);
  const publishMode = Form.useWatch('publishMode', form) ?? 'now';
  const bodyValue = Form.useWatch('body', form);
  const bodyZhValue = Form.useWatch('bodyZh', form);
  // Editing the message of an acknowledged post resets everyone's acknowledgement.
  const acknowledgedCount =
    locked && existing?.requireAcknowledgement ? existing.stats.acknowledged : 0;
  const messageChanged =
    locked &&
    existing !== undefined &&
    ((bodyValue !== undefined && bodyValue !== existing.body) ||
      (bodyZhValue !== undefined && (bodyZhValue?.trim() || null) !== (existing.bodyZh ?? null)));
  const confirmReacknowledge = acknowledgedCount > 0 && messageChanged;

  const audienceInput = useMemo(
    () => ({
      audienceScope: scope,
      departmentIds: scope === 'DEPARTMENTS' ? (departmentIds ?? []) : [],
      disciplineIds: scope === 'DISCIPLINES' ? (disciplineIds ?? []) : [],
      roleIds: scope === 'ROLES' ? (roleIds ?? []) : [],
      employeeIds: scope === 'EMPLOYEES' ? (employeeIds ?? []) : [],
    }),
    [scope, departmentIds, disciplineIds, roleIds, employeeIds],
  );
  const audienceCount = useAnnouncementAudienceCount(audienceInput, !isSystem && !locked);

  const initialValues: FormValues = {
    title: existing?.title ?? '',
    titleZh: existing?.titleZh ?? '',
    body: existing?.body ?? '',
    bodyZh: existing?.bodyZh ?? '',
    priority: existing?.priority ?? 'NORMAL',
    audienceScope: existing?.audienceScope ?? 'ALL',
    departmentIds: existing?.departmentIds ?? [],
    disciplineIds: existing?.disciplineIds ?? [],
    roleIds: existing?.roleIds ?? [],
    employeeIds: existing?.employeeIds ?? [],
    requireAcknowledgement: existing?.requireAcknowledgement ?? false,
    sendEmail: existing?.sendEmail ?? false,
    pinned: existing?.pinned ?? false,
    publishMode: existing?.status === 'SCHEDULED' ? 'schedule' : 'now',
    publishAt: existing?.publishAt ? dayjs(existing.publishAt) : null,
    expiresAt: existing?.expiresAt ? dayjs(existing.expiresAt) : null,
  };

  function toPayload(values: FormValues): AnnouncementWritePayload {
    const content: AnnouncementWritePayload = {
      title: values.title.trim(),
      titleZh: values.titleZh?.trim() || null,
      body: values.body,
      bodyZh: values.bodyZh?.trim() ? values.bodyZh : null,
      pinned: values.pinned,
      expiresAt: values.expiresAt ? values.expiresAt.toISOString() : null,
    };
    if (locked) {
      return content;
    }
    return {
      ...content,
      ...(existing ? {} : { type }),
      priority: values.priority,
      ...(isSystem
        ? {}
        : {
            ...audienceInput,
            requireAcknowledgement: values.requireAcknowledgement,
            sendEmail: values.sendEmail,
          }),
    };
  }

  async function save(publish: boolean): Promise<void> {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (publish && values.publishMode === 'schedule' && !values.publishAt) {
      form.setFields([{ name: 'publishAt', errors: [t('announcements.form.publishAtRequired')] }]);
      return;
    }
    setBusy(true);
    try {
      const payload = toPayload(values);
      const saved = existing
        ? await updateMutation.mutateAsync(payload)
        : await createMutation.mutateAsync(payload);
      if (pendingFiles.length > 0) {
        await uploadAnnouncementFiles(saved.id, pendingFiles);
        setPendingFiles([]);
        void queryClient.invalidateQueries({ queryKey: announcementKeys.all });
      }
      if (publish) {
        const result = await publishMutation.mutateAsync({
          id: saved.id,
          publishAt: values.publishMode === 'schedule' ? values.publishAt?.toISOString() : null,
        });
        messageApi.success(
          result.status === 'SCHEDULED'
            ? t('announcements.form.scheduledSuccess', {
                date: dayjs(result.publishAt).format('YYYY-MM-DD HH:mm'),
              })
            : t('announcements.form.publishedSuccess', { count: result.stats.recipients }),
        );
      } else if (locked) {
        const reset = saved.acknowledgementsReset ?? 0;
        messageApi.success(
          reset > 0
            ? t('announcements.form.reacknowledgeSaved', { count: reset })
            : t('announcements.form.changesSaved'),
        );
      } else {
        messageApi.success(t('announcements.form.savedSuccess'));
      }
      router.push(`/hr/announcements/${saved.id}`);
    } catch (error) {
      notifyApiError(error, t('announcements.form.saveFailed'), messageApi, t);
    } finally {
      setBusy(false);
    }
  }

  const backHref = existing ? `/hr/announcements/${existing.id}` : '/hr/announcements';
  const recipientCount = audienceCount.data?.count;

  return (
    <div className="erp-ann-page">
      <HrFormPageShell
        title={
          existing
            ? t('announcements.pages.edit')
            : t('announcements.pages.new')
        }
        description={t('announcements.pages.formDescription')}
        cancelLabel={t('common.cancel')}
        cancelHref={backHref}
        backLabel={
          existing ? existing.number : t('hr.buttons.backToList')
        }
      >
      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={initialValues}
        requiredMark={false}
        className="erp-ann-form"
        disabled={busy}
      >
        <section className="erp-ann-card">
          <div className="erp-ann-form-section">
            {isSystem ? (
              <Alert
                type="info"
                showIcon
                className="mb-4"
                title={t('announcements.form.systemNote')}
              />
            ) : null}
            {locked ? (
              <Alert
                type="info"
                showIcon
                className="mb-4"
                title={t('announcements.form.lockedNote')}
              />
            ) : null}
            {acknowledgedCount > 0 ? (
              <Alert
                type="warning"
                showIcon
                className="mb-4"
                title={t('announcements.form.reacknowledgeWarning', { count: acknowledgedCount })}
                description={t('announcements.form.reacknowledgeHint')}
              />
            ) : null}
            <Form.Item
              name="title"
              label={t('announcements.form.title')}
              rules={[{ required: true, whitespace: true, message: t('announcements.form.titleRequired') }]}
            >
              <Input maxLength={200} showCount />
            </Form.Item>
            <Form.Item
              name="body"
              label={t('announcements.form.body')}
              rules={[{ required: true, whitespace: true, message: t('announcements.form.bodyRequired') }]}
            >
              <MarkdownEditor placeholder={t('announcements.form.bodyPlaceholder')} />
            </Form.Item>
            <Collapse
              ghost
              className="mb-4"
              defaultActiveKey={existing?.titleZh || existing?.bodyZh ? ['zh'] : []}
              items={[
                {
                  key: 'zh',
                  label: t('announcements.form.chineseVersion'),
                  children: (
                    <>
                      <Form.Item name="titleZh" label={t('announcements.form.titleZh')}>
                        <Input maxLength={200} />
                      </Form.Item>
                      <Form.Item name="bodyZh" label={t('announcements.form.bodyZh')}>
                        <MarkdownEditor />
                      </Form.Item>
                    </>
                  ),
                },
              ]}
            />
          </div>

          <div className="erp-ann-form-section">
            <p className="erp-ann-section-title">{t('announcements.form.attachments')}</p>
            {existing?.attachments.length ? (
              <ul className="erp-ann-attachments mb-3">
                {existing.attachments.map((file) => (
                  <li key={file.id} className="erp-ann-attachment">
                    <Paperclip size={15} strokeWidth={2} aria-hidden />
                    <span className="erp-ann-attachment-name">{file.name}</span>
                    <span className="erp-ann-attachment-size">{formatFileSize(file.fileSizeBytes)}</span>
                    <Button
                      type="text"
                      size="small"
                      aria-label={t('announcements.form.removeAttachment', { name: file.name })}
                      icon={<X size={14} />}
                      loading={deleteAttachment.isPending}
                      onClick={() =>
                        deleteAttachment.mutate(file.id, {
                          onError: (error) =>
                            notifyApiError(error, t('announcements.form.saveFailed'), messageApi, t),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            <Upload
              multiple
              fileList={pendingFiles.map((file, index) => ({
                uid: `${index}-${file.name}`,
                name: file.name,
                status: 'done' as const,
              }))}
              beforeUpload={(file) => {
                setPendingFiles((current) => [...current, file]);
                return false;
              }}
              onRemove={(entry) => {
                setPendingFiles((current) =>
                  current.filter((file, index) => `${index}-${file.name}` !== entry.uid),
                );
              }}
            >
              <Button icon={<UploadOutlined />}>{t('announcements.form.addFiles')}</Button>
            </Upload>
            <p className="erp-ann-editor-hint mb-4">{t('announcements.form.attachmentsHint')}</p>
          </div>
        </section>

        <aside className="erp-ann-card">
          {!isSystem ? (
            <div className="erp-ann-form-section">
              <Form.Item name="audienceScope" label={t('announcements.form.audience')}>
                <Radio.Group disabled={locked} className="flex flex-col gap-2">
                  {SCOPES.map((value) => (
                    <Radio key={value} value={value}>
                      {t(scopeLabelKey(value))}
                    </Radio>
                  ))}
                </Radio.Group>
              </Form.Item>
              {scope === 'DEPARTMENTS' ? (
                <Form.Item
                  name="departmentIds"
                  label={t('announcements.form.departments')}
                  rules={[{ required: true, type: 'array', min: 1, message: t('announcements.form.pickOne') }]}
                >
                  <Select
                    mode="multiple"
                    disabled={locked}
                    optionFilterProp="label"
                    loading={options.isLoading}
                    options={(options.data?.departments ?? []).map((item) => ({ value: item.id, label: item.name }))}
                  />
                </Form.Item>
              ) : null}
              {scope === 'DISCIPLINES' ? (
                <Form.Item
                  name="disciplineIds"
                  label={t('announcements.form.disciplines')}
                  rules={[{ required: true, type: 'array', min: 1, message: t('announcements.form.pickOne') }]}
                >
                  <Select
                    mode="multiple"
                    disabled={locked}
                    optionFilterProp="label"
                    loading={options.isLoading}
                    options={(options.data?.disciplines ?? []).map((item) => ({ value: item.id, label: item.name }))}
                  />
                </Form.Item>
              ) : null}
              {scope === 'ROLES' ? (
                <Form.Item
                  name="roleIds"
                  label={t('announcements.form.roles')}
                  rules={[{ required: true, type: 'array', min: 1, message: t('announcements.form.pickOne') }]}
                >
                  <Select
                    mode="multiple"
                    disabled={locked}
                    optionFilterProp="label"
                    loading={options.isLoading}
                    options={(options.data?.roles ?? []).map((item) => ({ value: item.id, label: item.name }))}
                  />
                </Form.Item>
              ) : null}
              {scope === 'EMPLOYEES' ? (
                <Form.Item
                  name="employeeIds"
                  label={t('announcements.form.employees')}
                  rules={[{ required: true, type: 'array', min: 1, message: t('announcements.form.pickOne') }]}
                >
                  <Select
                    mode="multiple"
                    disabled={locked}
                    optionFilterProp="label"
                    loading={options.isLoading}
                    options={(options.data?.employees ?? []).map((item) => ({
                      value: item.id,
                      label: `${formatUserName(item)}${item.employeeId ? ` · ${item.employeeId}` : ''}`,
                    }))}
                  />
                </Form.Item>
              ) : null}
              {!locked ? (
                <p className="erp-ann-recipient-count" aria-live="polite">
                  <Users size={15} strokeWidth={2} aria-hidden />
                  {recipientCount === undefined
                    ? t('announcements.form.countingRecipients')
                    : t('announcements.form.recipientCount', { count: recipientCount })}
                </p>
              ) : existing ? (
                <p className="erp-ann-recipient-count">
                  <Users size={15} strokeWidth={2} aria-hidden />
                  {t('announcements.form.recipientCount', { count: existing.stats.recipients })}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="erp-ann-form-section">
            <Form.Item name="priority" label={t('announcements.form.priority')}>
              <Radio.Group disabled={locked} optionType="button" buttonStyle="solid">
                {PRIORITIES.map((value) => (
                  <Radio.Button key={value} value={value}>
                    {t(priorityLabelKey(value))}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
            {!isSystem ? (
              <>
                <Form.Item name="requireAcknowledgement" valuePropName="checked" noStyle>
                  <SwitchRow
                    label={t('announcements.form.requireAck')}
                    hint={t('announcements.form.requireAckHint')}
                    disabled={locked}
                  />
                </Form.Item>
                <Form.Item name="sendEmail" valuePropName="checked" noStyle>
                  <SwitchRow
                    label={t('announcements.form.sendEmail')}
                    hint={t('announcements.form.sendEmailHint')}
                    disabled={locked}
                  />
                </Form.Item>
              </>
            ) : null}
            <Form.Item name="pinned" valuePropName="checked" noStyle>
              <SwitchRow label={t('announcements.form.pinned')} hint={t('announcements.form.pinnedHint')} />
            </Form.Item>
            <div className="h-4" />
          </div>

          <div className="erp-ann-form-section">
            {!locked && canPublish ? (
              <>
                <Form.Item name="publishMode" label={t('announcements.form.whenToPublish')}>
                  <Radio.Group>
                    <Radio value="now">{t('announcements.form.publishNow')}</Radio>
                    <Radio value="schedule">{t('announcements.form.schedule')}</Radio>
                  </Radio.Group>
                </Form.Item>
                {publishMode === 'schedule' ? (
                  <Form.Item name="publishAt" label={t('announcements.form.publishAt')}>
                    <DatePicker
                      showTime={{ format: 'HH:mm' }}
                      format="YYYY-MM-DD HH:mm"
                      disabledDate={(date) => date.isBefore(dayjs().startOf('day'))}
                    />
                  </Form.Item>
                ) : null}
              </>
            ) : null}
            <Form.Item
              name="expiresAt"
              label={t('announcements.form.expiresAt')}
              extra={t('announcements.form.expiresAtHint')}
            >
              <DatePicker
                showTime={{ format: 'HH:mm' }}
                format="YYYY-MM-DD HH:mm"
                disabledDate={(date) => date.isBefore(dayjs().startOf('day'))}
              />
            </Form.Item>
            {!canPublish && !locked ? (
              <Alert type="info" showIcon className="mb-4" title={t('announcements.form.draftOnlyNote')} />
            ) : null}
          </div>

          <div className="erp-ann-form-actions">
            {locked ? (
              <Popconfirm
                disabled={!confirmReacknowledge}
                title={t('announcements.form.reacknowledgeConfirm')}
                description={t('announcements.form.reacknowledgeWarning', { count: acknowledgedCount })}
                okText={t('announcements.form.saveChanges')}
                cancelText={t('common.cancel')}
                onConfirm={() => void save(false)}
              >
                <Button
                  type="primary"
                  loading={busy}
                  onClick={confirmReacknowledge ? undefined : () => void save(false)}
                >
                  {t('announcements.form.saveChanges')}
                </Button>
              </Popconfirm>
            ) : (
              <>
                <Button loading={busy} onClick={() => void save(false)}>
                  {t('announcements.form.saveDraft')}
                </Button>
                {canPublish ? (
                  <Popconfirm
                    title={
                      publishMode === 'schedule'
                        ? t('announcements.form.confirmSchedule')
                        : t('announcements.form.confirmPublish')
                    }
                    description={
                      isSystem
                        ? t('announcements.form.confirmSystem')
                        : t('announcements.form.recipientCount', { count: recipientCount ?? 0 })
                    }
                    okText={
                      publishMode === 'schedule'
                        ? t('announcements.form.schedule')
                        : t('announcements.form.publishNow')
                    }
                    cancelText={t('common.cancel')}
                    onConfirm={() => void save(true)}
                  >
                    <Button type="primary" loading={busy}>
                      {publishMode === 'schedule'
                        ? t('announcements.form.schedule')
                        : t('announcements.form.publishNow')}
                    </Button>
                  </Popconfirm>
                ) : null}
              </>
            )}
          </div>
        </aside>
      </Form>
      </HrFormPageShell>
    </div>
  );
}
