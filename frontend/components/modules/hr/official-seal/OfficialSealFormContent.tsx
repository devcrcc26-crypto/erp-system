'use client';
import { Button } from "antd";
import FormLayout from "@/components/ui/FormLayout/FormLayout";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { OfficialSealDetail } from "@/lib/api/official-seal.types";
import OfficialSealForm from "./OfficialSealForm";
import { useRouter } from "next/navigation";


export default function OfficialSealFormContent(): React.ReactNode {
    const { t } = useEpcTranslation();
    const router = useRouter();
    function handleSuccess(created: OfficialSealDetail): void {
        if (created.approvalRequestId) {
            router.push(`/approvals/${created.approvalRequestId}`);
        } else {
            router.push(`/hr/official-seal/${created.id}`);
        }
    }
    return(
    <FormLayout
      title={t('hr.buttons.newOfficialSeal')}
      description="Create a new official seal"
      extra={
        <Button onClick={() => router.push('/approvals/new')}>
          {t('hr.buttons.cancel')}
        </Button>
      }>
        <OfficialSealForm onSuccess={handleSuccess} />
    </FormLayout>
    )
}