export default async function EvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return (
    <div style={{ padding: 24 }}>
      <p>Evaluation detail page — coming in Chunk D</p>
      <p>ID: {id}</p>
    </div>
  );
}
