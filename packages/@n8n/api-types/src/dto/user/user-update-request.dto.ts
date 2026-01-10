import xss from 'xss';
import { z } from 'zod';
import { Z } from 'zod-class';

const xssCheck = (value: string) =>
	value ===
	xss(value, {
		whiteList: {}, // no tags are allowed
	});

const URL_REGEX = /^(https?:\/\/|www\.)|(\.[\p{L}\d-]+)/iu;
const urlCheck = (value: string) => !URL_REGEX.test(value);

export class UserUpdateRequestDto extends Z.class({
	email: z.string(),
	firstName: z
		.string()
		.max(32)
		.min(1)
		.refine(xssCheck, {
			message: 'Potentially malicious string',
		})
		.refine(urlCheck, {
			message: 'Potentially malicious string',
		})
		.optional(),
	lastName: z
		.string()
		.max(32)
		.refine(xssCheck, {
			message: 'Potentially malicious string',
		})
		.refine(urlCheck, {
			message: 'Potentially malicious string',
		})
		.optional(),
	mfaCode: z.string().optional(),
	/**
	 * The current password is required when changing the email address and MFA is disabled.
	 */
	currentPassword: z.string().optional(),
}) {}
