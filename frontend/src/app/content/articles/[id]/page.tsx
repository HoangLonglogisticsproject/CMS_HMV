import { ArticleEditorView } from "@/modules/content/articles/components/article-editor-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ArticleEditorView articleId={id} />;
}
