import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class SlackTriggerPlus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Better Slack Trigger',
		name: 'slackTriggerPlus',
		icon: 'file:slack.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["trigger"].join(", ")}}',
		description: 'Handle Slack events via webhooks',
		defaults: {
			name: 'Better Slack Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'slackApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'hidden',
				default: 'accessToken',
			},
			{
				displayName: 'Trigger On Events',
				name: 'trigger',
				type: 'multiOptions',
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				typeOptions: {
					loadOptionsMethod: 'getSlackEvents',
				},
				default: [],
			},
		],
	};

	methods = {
		loadOptions: {
			async getSlackEvents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return (
					(await this.helpers.httpRequest({
						url: 'https://docs.slack.dev/reference/events.json',
						// eslint-disable-next-line @typescript-eslint/naming-convention
					})) as Array<{ name: string; description: string; scopes: string[]; APIs: string[] }>
				)
					.filter((event) => event.APIs.includes('Events'))
					.map((event) => ({
						name: event.name,
						value: event.name,
						description:
							event.description +
							(event.scopes?.length ? ` (Scopes: ${event.scopes.join(', ')})` : ''),
					}));
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		return {
			workflowData: [
				[
					{
						json: this.getBodyData().event as IDataObject,
					},
				],
			],
		};
	}
}
