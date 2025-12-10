import type { INodeProperties, IExecuteFunctions } from 'n8n-workflow';

import {
	getSendAndWaitConfig,
	getSendAndWaitProperties,
} from '../../../../../../utils/sendAndWait/utils';
import { chatRLC } from '../../descriptions';
import { microsoftApiRequest } from '../../transport';

export const description: INodeProperties[] = getSendAndWaitProperties(
	[chatRLC],
	'chatMessage',
	undefined,
	{
		noButtonStyle: true,
		defaultApproveLabel: '✓ Approve',
		defaultDisapproveLabel: '✗ Decline',
	},
).filter((p) => p.name !== 'subject');

export async function execute(this: IExecuteFunctions, i: number, instanceId: string) {
	const chatId = this.getNodeParameter('chatId', i, '', { extractValue: true }) as string;
	const config = getSendAndWaitConfig(this);

	const buttons = config.options.map((option) => `<a href="${option.url}">${option.label}</a>`);

	const body = {
		body: {
			contentType: 'html',
			content: `${config.message}<br><br>${buttons.join(' ')}`,
		},
	};

	return await microsoftApiRequest.call(this, 'POST', `/v1.0/chats/${chatId}/messages`, body);
}
