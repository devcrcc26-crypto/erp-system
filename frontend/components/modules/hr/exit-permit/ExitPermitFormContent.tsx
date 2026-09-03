import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { useRouter } from "next/navigation";
import { useSetHeaderExtra } from "@/hooks/use-set-header-extra";
import { Button } from "antd";
import { ExitPermitDetail } from "@/lib/api/exit-permit.types";
import ExitPermitForm from "./ExitPermitForm";

export default function ExitPermitFormContent(): React.ReactNode {
    const { t } = useEpcTranslation();
    const router = useRouter();

    useSetHeaderExtra(null);

    function handleSuccess(created: ExitPermitDetail): void {
        if (created.approvalRequestId) {
            router.push(`/approvals/${created.approvalRequestId}`);
        } else {
            router.push(`/hr/exit-permit/${created.id}`);
        }
    }
    return (
        <div>
            <div>
                <Button>
                    {t('hr.buttons.cancel')}
                </Button>
            </div>
            <ExitPermitForm onSuccess={handleSuccess} />
        </div>
    )
}