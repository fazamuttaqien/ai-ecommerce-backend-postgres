import { z } from 'zod';

const AI_MAX_MESSAGES = 20;
const AI_MAX_MESSAGE_LENGTH = 4000;
const AI_MAX_TOTAL_INPUT_LENGTH = 12000;

const aiMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(AI_MAX_MESSAGE_LENGTH),
});

export const aiChatSchema = z
  .object({
    messages: z.array(aiMessageSchema).min(1).max(AI_MAX_MESSAGES),
  })
  .superRefine((value, ctx) => {
    const totalLength = value.messages.reduce(
      (total, message) => total + message.content.length,
      0,
    );

    if (totalLength > AI_MAX_TOTAL_INPUT_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        path: ['messages'],
        message: `Total message content must not exceed ${AI_MAX_TOTAL_INPUT_LENGTH} characters`,
      });
    }
  });

export type AIChatInput = z.infer<typeof aiChatSchema>;

export const AI_CHAT_LIMITS = {
  maxMessages: AI_MAX_MESSAGES,
  maxMessageLength: AI_MAX_MESSAGE_LENGTH,
  maxTotalInputLength: AI_MAX_TOTAL_INPUT_LENGTH,
} as const;
