import ProjectSealDetailPageContent from "@/components/modules/hr/project-seal/ProjectSealDetailPageContent";

export default async function ProjectSealDetailPage({
    params,
}:{
    params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
    const { id } = await params;
    return <ProjectSealDetailPageContent sealId={id} />;
}