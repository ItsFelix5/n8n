import type { AuthenticatedRequest } from '@n8n/db';
import { Container } from '@n8n/di';
import { hasGlobalScope } from '@n8n/permissions';
import type { Response } from 'express';
import type { IHttpRequestMethods } from 'n8n-workflow';

import { WebhookService } from '@/webhooks/webhook.service';

export = {
	find: [
		async (
			req: AuthenticatedRequest<{}, {}, {}, { method: IHttpRequestMethods; url: string }>,
			res: Response,
		): Promise<Response> => {
			try {
				const result = await Container.get(WebhookService).findWebhook(
					req.query.method,
					req.query.url,
				);

				if (!hasGlobalScope(req.user, 'workflow:read'))
					return res.status(401).json({ message: 'No permission :P' });
				if (!result) return res.status(404).json({ message: 'Webhook not found' });
				return res.json(result);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return res.status(500).json({ message: errorMessage });
			}
		},
	],
};
