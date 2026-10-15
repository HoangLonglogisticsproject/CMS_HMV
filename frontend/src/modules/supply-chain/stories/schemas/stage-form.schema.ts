import { z } from "zod";

export const stageFormSchema = z.object({
  titleVi: z.string().min(2, "Tiêu đề Tiếng Việt không được để trống"),
  titleEn: z.string().min(2, "English title is required"),
  subtitle: z.string().min(2, "Mô tả trọng tâm không được để trống"),
  tier: z.enum(["DIRECT_OPERATION", "STRATEGIC_PARTNER", "IN_DEVELOPMENT"]),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"]),
  keyCapability: z.string().min(2, "Năng lực cốt lõi không được để trống"),
  descriptionVi: z.string().min(5, "Nội dung chi tiết (VI) phải từ 5 ký tự"),
  descriptionEn: z.string().min(5, "Detailed content (EN) must be at least 5 characters"),
});

export type StageFormValues = z.infer<typeof stageFormSchema>;
