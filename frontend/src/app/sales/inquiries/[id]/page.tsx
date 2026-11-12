import { InquiryDetailView } from "@/modules/sales/components/inquiry-detail-view";

type PageProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

export default async function InquiryDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <InquiryDetailView inquiryId={id} />;
}
