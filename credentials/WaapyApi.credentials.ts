import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WaapyApi implements ICredentialType {
	name = 'waapyApi';
	displayName = 'Waapy API';
	documentationUrl = 'https://waapy.co'; 
	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'server-url',
			type: 'string',
			default: 'https://api.waapy.co',
			placeholder: 'https://api.waapy.co',
			description: 'The base URL of the Waapy API',
		},
		{
			displayName: 'API Key',
			name: 'apikey',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
			description: 'The API Key to authenticate with Waapy',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Authorization': '=Bearer {{$credentials.apikey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials["server-url"]}}',
			url: '/n8n/health',
			method: 'GET',
		},
	};
}
