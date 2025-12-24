import { ChangePasswordRequestDto, ResolvePasswordTokenQueryDto } from '@n8n/api-types';
import { Logger } from '@n8n/backend-common';
import { GLOBAL_OWNER_ROLE } from '@n8n/db';
import { Body, Get, Post, Query, RestController } from '@n8n/decorators';
import { Response } from 'express';

import { AuthService } from '@/auth/auth.service';
import { RESPONSE_ERROR_MESSAGES } from '@/constants';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import { EventService } from '@/events/event.service';
import { ExternalHooks } from '@/external-hooks';
import { License } from '@/license';
import { MfaService } from '@/mfa/mfa.service';
import { AuthlessRequest } from '@/requests';
import { PasswordUtility } from '@/services/password.utility';
import { UserService } from '@/services/user.service';

@RestController()
export class PasswordResetController {
	constructor(
		private readonly logger: Logger,
		private readonly externalHooks: ExternalHooks,
		private readonly authService: AuthService,
		private readonly userService: UserService,
		private readonly mfaService: MfaService,
		private readonly license: License,
		private readonly passwordUtility: PasswordUtility,
		private readonly eventService: EventService,
	) {}

	/**
	 * Send a password reset email.
	 */
	@Post('/forgot-password', { skipAuth: true, rateLimit: { limit: 3 } })
	forgotPassword(_req: AuthlessRequest, _res: Response) {
		throw new InternalServerError(
			'Email sending must be set up in order to request a password reset email',
		);
	}

	/**
	 * Verify password reset token and user ID.
	 */
	@Get('/resolve-password-token', { skipAuth: true })
	async resolvePasswordToken(
		_req: AuthlessRequest,
		_res: Response,
		@Query payload: ResolvePasswordTokenQueryDto,
	) {
		const { token } = payload;
		const user = await this.authService.resolvePasswordResetToken(token);
		if (!user) throw new NotFoundError('');

		if (user.role.slug !== GLOBAL_OWNER_ROLE.slug && !this.license.isWithinUsersLimit()) {
			this.logger.debug(
				'Request to resolve password token failed because the user limit was reached',
				{ userId: user.id },
			);
			throw new ForbiddenError(RESPONSE_ERROR_MESSAGES.USERS_QUOTA_REACHED);
		}

		this.logger.info('Reset-password token resolved successfully', { userId: user.id });
		this.eventService.emit('user-password-reset-email-click', { user });
	}

	/**
	 * Verify password reset token and update password.
	 */
	@Post('/change-password', { skipAuth: true })
	async changePassword(
		req: AuthlessRequest,
		res: Response,
		@Body payload: ChangePasswordRequestDto,
	) {
		const { token, password, mfaCode } = payload;

		const user = await this.authService.resolvePasswordResetToken(token);
		if (!user) throw new NotFoundError('');

		if (user.mfaEnabled) {
			if (!mfaCode) throw new BadRequestError('If MFA enabled, mfaCode is required.');

			const { decryptedSecret: secret } = await this.mfaService.getSecretAndRecoveryCodes(user.id);

			const validToken = this.mfaService.totp.verifySecret({ secret, mfaCode });

			if (!validToken) throw new BadRequestError('Invalid MFA token.');
		}

		const passwordHash = await this.passwordUtility.hash(password);

		await this.userService.update(user.id, { password: passwordHash });

		this.logger.info('User password updated successfully', { userId: user.id });

		this.authService.issueCookie(res, user, user.mfaEnabled, req.browserId);

		this.eventService.emit('user-updated', { user, fieldsChanged: ['password'] });

		// if this user used to be an LDAP user
		const ldapIdentity = user?.authIdentities?.find((i) => i.providerType === 'ldap');
		if (ldapIdentity) {
			this.eventService.emit('user-signed-up', {
				user,
				userType: 'email',
				wasDisabledLdapUser: true,
			});
		}

		await this.externalHooks.run('user.password.update', [user.email, passwordHash]);
	}
}
