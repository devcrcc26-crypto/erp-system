import PlaceholderPage from '@/components/PlaceholderPage';
import { Layers } from 'lucide-react';

export default function EpcWorkspacePlaceholder({
  title,
  description,
}: {
  title: string;
  description?: string;
}): React.ReactNode {
  return (
    <PlaceholderPage
      icon={Layers}
      title={title}
      description={
        description ??
        'This workspace is part of the EPC design workflow rollout. Implementation continues in the next phase.'
      }
    />
  );
}
