// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khuôn nội dung chính sách tích điểm dùng chung cho website đẩy và nháp kế toán (đóng góp)
/** Khuôn zod của LoyaltyProgram (settings, tiers, policies loại 1–6). Website đẩy có `version`; nháp kế toán không (gán lúc phát hành). */
import { z } from '@bizcity/module-sdk';

export const settingsSchema = z.object({
  enablePosEarn: z.boolean(), enablePosRedeem: z.boolean(), enableTierMultiplier: z.boolean(),
  minRedeemPoints: z.number().nonnegative(), pointLabel: z.string().max(50),
}).passthrough();
export const tierSchema = z.object({ key: z.string().min(1).max(50), name: z.string().max(100), minPoints: z.number().nonnegative(), multiplier: z.number().positive() }).passthrough();
export const policySchema = z.object({ id: z.number().int(), code: z.string().max(100), type: z.number().int().min(1).max(6) }).passthrough();

/** Nội dung nháp: đủ trường bộ tính đọc (engine.ts LoyaltyPolicy). */
export const draftPolicySchema = z.object({
  id: z.number().int().positive(), code: z.string().trim().max(100), title: z.string().trim().max(200), type: z.number().int().min(1).max(6),
  priority: z.number().int().default(0), status: z.number().int().min(0).max(1).default(1), autoApply: z.boolean().default(true),
  startDate: z.number().int().nonnegative().default(0), endDate: z.number().int().nonnegative().default(0),
  applyToBlogIds: z.array(z.number().int()).max(500).default([]), rules: z.record(z.unknown()).default({}),
}).passthrough();
export const draftContentSchema = z.object({
  settings: settingsSchema,
  tiers: z.array(tierSchema).max(50),
  policies: z.array(draftPolicySchema).max(500),
});

export const programSchema = z.object({
  version: z.string().trim().min(1).max(100),
  settings: settingsSchema,
  tiers: z.array(tierSchema).max(50),
  policies: z.array(policySchema).max(500),
}).passthrough();

export const idsSchema = z.array(z.string().trim().min(1).max(64)).min(1, 'Chọn ít nhất một nháp').max(200);
