# Staff join by Invitation; Google sign-in links by verified email

Staff join a Workspace only by accepting an Invitation sent to their email address; an Admin can no longer create an account with a password they chose. Accepting proves the invitee owns the address, so it also verifies their email. Self-registration by form must verify its email before the first sign-in, because every registration creates an Organization with a Trial Grant. "Continue with Google" both signs in and registers, and links to an existing user whose email matches Google's verified email, without asking for that user's password. A registration whose email has a pending Invitation is turned into accepting that Invitation instead of creating a new Organization, since a user belongs to exactly one Organization and there is no way to move between them.

## Considered Options

- **Admins keep creating staff with a password.** Rejected: the Admin knows another person's credential, nothing proves the address is real, and the password travels outside the platform.
- **Soft email verification (sign in first, verify later).** Rejected: unverified addresses could farm Trial Grants, and the click-a-link flow costs the user one step, not an OTP.
- **Manual Google account linking from Profile.** Rejected: users who registered by form and later click "Continue with Google" would hit a dead end; Google's verified email is the same proof a verification link gives.

## Consequences

- Existing users are marked verified at migration so no one is locked out.
- Google sign-in is optional per deployment: without its credentials the button is hidden and every flow still works.
- An Invitation can only be accepted with the invited address, including through Google; a different Google email is refused.
- Operators are unaffected: their password is still set only by the CLI (ADR-0024).
