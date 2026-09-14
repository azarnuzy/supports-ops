# Internal SOP: verifying identity for 2FA recovery

**Visibility: Internal-Only**

A Customer who has lost both their authenticator app and backup codes must be identity-verified before a Human Agent disables 2FA on their account. Do not disable 2FA from chat without completing this check, even if the Customer sounds legitimate or is visibly frustrated.

Verification steps:

1. Confirm the Customer can receive email at the address on file — send a one-time confirmation code to that address and ask them to read it back. Never accept an email address they type in chat as sufficient on its own.
2. Cross-check the account's billing name against what the Customer states, using the Business Tools. A mismatch is not automatically disqualifying (accounts are sometimes registered under a company name), but it should be noted in the Handoff if it happens.
3. If the Customer cannot complete step 1 because they no longer control that inbox, escalate to an Admin rather than disabling 2FA yourself. Admin-level identity verification for lost-email cases is out of scope for a first-line Human Agent.

This SOP exists because 2FA recovery is the single highest-risk support action for account takeover; treat every request with the same rigor regardless of how much account history or how urgent the Customer's tone is.
