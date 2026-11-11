import { InquiryDetailView } from "@/modules/sales/components/inquiry-detail-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InquiryDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <InquiryDetailView inquiryId={id} />;
}
