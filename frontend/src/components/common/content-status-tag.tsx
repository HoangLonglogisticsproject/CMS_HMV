import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { PublicationStatus } from "@/lib/mocks/types";

interface ContentStatusTagProps {
  status: PublicationStatus;
}

export const ContentStatusTag: React.FC<ContentStatusTagProps> = ({ status }) => {
  switch (status) {
    case "PUBLISHED":
      return <Badge variant="success">Đã xuất bản</Badge>;
    case "IN_REVIEW":
      return <Badge variant="warning">Chờ duyệt</Badge>;
    case "APPROVED":
      return <Badge variant="info">Đã phê duyệt</Badge>;
    case "DRAFT":
      return <Badge variant="outline">Bản nháp</Badge>;
    case "ARCHIVED":
      return <Badge variant="destructive">Lưu trữ</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};
