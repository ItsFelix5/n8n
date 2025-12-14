import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export class OpenAiApi implements ICredentialType {
	name = 'openAiApi';

	displayName = 'OpenAi';

	documentationUrl = 'openai';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
		{
			displayName: 'Organization ID (optional)',
			name: 'organizationId',
			type: 'string',
			default: '',
			hint: 'Only required if you belong to multiple organisations',
			description:
				"For users who belong to multiple organizations, you can set which organization is used for an API request. Usage from these API requests will count against the specified organization's subscription quota.",
		},
		{
			displayName: 'Base URL',
			name: 'url',
			type: 'options',
			options: [
				{
					name: 'OpenAI (Official)',
					value: 'https://api.openai.com/v1',
				},
				{
					name: 'Hack Club AI',
					value: 'https://ai.hackclub.com/proxy/v1',
				},
				{
					name: 'Custom',
					value: 'custom',
				},
			],
			default: 'https://api.openai.com/v1',
			description: 'Select a base URL for the API or enter a custom one',
		},
		{
			displayName: 'Custom Endpoint',
			name: 'customUrl',
			type: 'string',
			displayOptions: {
				show: {
					url: ['custom'],
				},
			},
			default: 'https://your-custom-api.com/v1',
			description: 'The base URL for this endpoint',
		},
		{
			displayName: 'Add Custom Header',
			name: 'header',
			type: 'boolean',
			default: false,
		},
		{
			displayName: 'Header Name',
			name: 'headerName',
			type: 'string',
			displayOptions: {
				show: {
					header: [true],
				},
			},
			default: '',
		},
		{
			displayName: 'Header Value',
			name: 'headerValue',
			type: 'string',
			typeOptions: {
				password: true,
			},
			displayOptions: {
				show: {
					header: [true],
				},
			},
			default: '',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{$credentials?.url === "custom" ? ($credentials?.customUrl || "") : $credentials?.url}}',
			url: '/models',
		},
	};

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		requestOptions.headers ??= {};

		requestOptions.headers['Authorization'] = `Bearer ${credentials.apiKey}`;
		requestOptions.headers['OpenAI-Organization'] = credentials.organizationId;

		if (
			credentials.header &&
			typeof credentials.headerName === 'string' &&
			credentials.headerName &&
			typeof credentials.headerValue === 'string'
		) {
			requestOptions.headers[credentials.headerName] = credentials.headerValue;
		}

		requestOptions.baseURL = (
			credentials.url === 'custom' ? credentials.url : credentials.customUrl
		) as string;

		return requestOptions;
	}
}
