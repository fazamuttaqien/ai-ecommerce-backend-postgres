import { Request, Response } from 'express';

import { HTTPSTATUS } from '../config/http.config';
import { asyncHandler } from '../middlewares/asyncHandler.middleware';
import { generateAIChat } from '../services/ai.service';
import { aiChatSchema } from '../validators/ai.validator';

export const aiChatController = asyncHandler(
  async (req: Request, res: Response) => {
    const input = aiChatSchema.parse(req.body);
    const result = await generateAIChat(input);

    res.status(HTTPSTATUS.OK).json({
      message: 'AI response generated successfully',
      data: result,
    });
  },
);
