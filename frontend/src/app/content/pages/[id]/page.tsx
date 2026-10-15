import { PageEditorView } from "@/modules/content/pages/components/page-editor-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PageDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <PageEditorView pageId={id} />;
}
