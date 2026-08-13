import { FormLayout } from "@/components/ui";
import ProjectSealForm from "./ProjectSealForm";
import { ProjectSealDetail } from "@/lib/api/project-seal.types";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { useRouter } from "next/navigation";
import { Button } from "antd";


export default function ProjectSealFormContent(): React.ReactNode {

    const { t } = useEpcTranslation();
    const router = useRouter();
    function handleSuccess(created: ProjectSealDetail): void {
        if (created.approvalRequestId) {
            router.push(`/approvals/${created.approvalRequestId}`);
        } else {
            router.push(`/hr/project-seal/${created.id}`);
        }
    }
    return(
        <FormLayout
            title={t('hr.buttons.newProjectSeal')}
            description="Create a new project seal"
            extra={
                <Button onClick={() => router.push('/approvals/new')}>
                    {t('hr.buttons.cancel')}
                </Button>
            }
        >
            <ProjectSealForm onSuccess={handleSuccess} />
        </FormLayout>
    )
}