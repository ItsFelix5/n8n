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
					name: 'Hack Club ai',
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
			displayName: 'Custom Endpoints',
			name: 'customEndpoints',
			type: 'fixedCollection',
			typeOptions: {
				multipleValues: true,
			},
			displayOptions: {
				show: {
					url: ['custom'],
				},
			},
			default: {},
			placeholder: 'Add Custom Endpoint',
			options: [
				{
					name: 'endpoints',
					displayName: 'Endpoint',
					values: [
						{
							displayName: 'Name',
							name: 'name',
							type: 'string',
							default: '',
							placeholder: 'My Custom API',
							description: 'A friendly name for this endpoint',
						},
						{
							displayName: 'URL',
							name: 'url',
							type: 'string',
							default: '',
							placeholder: 'https://your-custom-api.com/v1',
							description: 'The base URL for this endpoint',
						},
					],
				},
			],
			description: 'Add one or more custom API endpoints',
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
				'={{$credentials?.url === "custom" ? ($credentials?.customEndpoints?.endpoints?.[0]?.url || "") : $credentials?.url}}',
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

		// Use custom URL if selected, otherwise use the selected preset
		if (credentials.url === 'custom' && credentials.customEndpoints) {
			const endpoints = (credentials.customEndpoints as any)?.endpoints;
			if (endpoints && Array.isArray(endpoints) && endpoints.length > 0) {
				requestOptions.baseURL = endpoints[0].url as string;
			}
		} else {
			requestOptions.baseURL = credentials.url as string;
		}

		return requestOptions;
	}
}
