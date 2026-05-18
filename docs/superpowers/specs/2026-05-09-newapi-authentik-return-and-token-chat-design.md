# NewAPI Authentik Return Flow and Token Chat Import Design

## Goal

Fix three related user-facing issues in the NewAPI, Authentik, and LobeHub flow:

- NewAPI logout and registration should return users to the NewAPI login page, not immediately send them back to Authentik.
- NewAPI password change should use Authentik without failing with `Invalid next URL`.
- NewAPI token management should open the chat UI with the selected token and NewAPI URL already configured.

## Scope

This design covers behavior and implementation boundaries only. It does not change deployed Authentik configuration by itself, but it identifies the required Authentik allow-list setting for password-change return URLs.

## Current Problems

### Login, Logout, and Registration

`new-api/router/web-router.go` currently intercepts `GET /login` and redirects directly to Authentik's OIDC authorize endpoint. Because logout and registration also return to `/login`, the user is sent back to Authentik instead of seeing the NewAPI login page.

The desired behavior is:

- `GET /login` serves the NewAPI login page.
- OIDC login happens only when the user clicks the OIDC login button.
- Logout clears the NewAPI session and returns to `/login`.
- Registration returns to the NewAPI login page after completion.

### Password Change

NewAPI's personal settings page currently sends users to an Authentik password-change flow with a `next` parameter. Authentik rejects the request when the `next` URL is not accepted by its redirect safety rules.

The desired behavior is:

- NewAPI links to the Authentik password-change flow.
- The `next` parameter points to one fixed NewAPI URL.
- Authentik is configured to allow that NewAPI return URL.
- If Authentik still rejects the return URL, the failure is treated as deployment configuration, not a NewAPI password form bug.

### Token Chat Import

The desired chat-entry behavior is user-token based, not server-token based:

- The user selects or opens a token from NewAPI token management.
- The chat entry carries that token and the current NewAPI base URL into LobeHub.
- After Authentik login, LobeHub has the NewAPI provider configured and the chat page is ready to use.

This intentionally differs from the earlier server-wide `NEWAPI_API_KEY` design. The selected user token should be used for the user's own chat session.

## Decisions

1. NewAPI remains the main UI entrypoint.
2. `/login` must not auto-redirect to Authentik.
3. The NewAPI OIDC button remains the only normal path from NewAPI login to Authentik login.
4. NewAPI logout should not trigger an Authentik end-session redirect in this phase.
5. Password change uses Authentik, but with a single fixed NewAPI `next` URL.
6. Token chat import should be implemented as a separate second phase.
7. The long-term token import should use a short-lived one-time code instead of putting the raw token in a durable URL.

## Phase 1: Auth Return Flow

### NewAPI Login

Remove the backend `/login` auto-redirect override. `GET /login` should fall through to the embedded web app, the same way other frontend routes do.

The existing frontend OIDC button should continue to call the normal OAuth helper, which generates state and sends the user to Authentik only after an explicit click.

### Registration

`GET /register` should serve the NewAPI registration route instead of redirecting to Authentik enrollment.

If local registration is disabled by settings, the frontend should show the existing disabled-registration message or a clear login-oriented state. It should not redirect to Authentik login automatically.

After successful registration, the existing frontend behavior of navigating to `/login` is correct once `/login` no longer auto-redirects.

### Logout

Logout should:

1. Call `/api/user/logout`.
2. Clear local user state.
3. Navigate to `/login`.

It should not call Authentik's OIDC end-session endpoint during this phase. This avoids returning to `/login` and immediately starting another Authentik login.

### Password Change

The password-change entry in NewAPI personal settings should link to Authentik's password-change flow with a fixed return URL. Recommended return URL:

```text
https://matrix.000328.xyz:2053/setting/personal
```

Deployment must configure Authentik so this URL is allowed as a `next` destination for the password-change flow. If Authentik requires only same-origin or application-bound redirects, use the Authentik-supported equivalent that returns to NewAPI's personal settings or login page.

## Phase 2: Token Chat Import

### Recommended Long-Term Flow

Use a one-time code flow:

```text
NewAPI token page
  -> user clicks chat for selected token
  -> NewAPI creates short-lived import code bound to token id and user session
  -> browser opens LobeHub import URL with the code only
  -> LobeHub completes Authentik login if needed
  -> LobeHub exchanges the code with NewAPI
  -> LobeHub writes NewAPI provider config for that user
  -> LobeHub opens chat ready to use
```

The import payload should contain:

- provider: `newapi`
- base URL: current NewAPI URL
- API key: selected NewAPI token value

The raw token should not be stored in browser history, nginx access logs, or long-lived query strings.

### Fast Validation Path

Before building the one-time code flow, verify whether LobeHub's existing `settings` import parameter can persist provider `keyVaults` after Authentik login.

If it works reliably, it can be used as a temporary implementation. If it loses settings during login or exposes the token in URLs/logs, use the one-time code flow.

## Components

### NewAPI Backend

- `new-api/router/web-router.go`: remove or narrow hardcoded Authentik redirects.
- Token import endpoint for Phase 2:
  - create short-lived import code
  - validate current NewAPI user session
  - exchange code for token/base URL once
  - expire code quickly after use

### NewAPI Frontend

- Login/register routes should render normally.
- Header logout should navigate to `/login` after NewAPI logout.
- Personal settings password-change button should use the fixed Authentik flow URL.
- Token management chat action should target the Phase 2 import flow.

### Authentik

- Keep NewAPI OIDC application/provider.
- Allow the fixed NewAPI password-change return URL.
- Do not rely on Authentik enrollment to replace NewAPI `/register` in this phase.

### LobeHub

- Continue Authentik SSO.
- Add or verify an import route that can receive NewAPI provider configuration for the authenticated user.
- Store the imported NewAPI provider config in the user's LobeHub settings.

## Error Handling

- If OIDC login fails, NewAPI should show the existing OAuth error path.
- If password-change `next` is rejected, surface it as Authentik configuration that needs allow-list adjustment.
- If token import code is expired, used, or invalid, LobeHub should show a clear import failure and let the user return to NewAPI token management.
- If LobeHub cannot save provider config, the chat page should not pretend configuration succeeded.

## Testing

### Phase 1

- `GET /login` returns the NewAPI web app with no `Location` header.
- `GET /register` returns the NewAPI web app with no `Location` header.
- Clicking the OIDC button still redirects to Authentik.
- Logout clears the NewAPI session and navigates to `/login`.
- Password-change URL contains the fixed NewAPI `next` URL.

### Phase 2

- Token chat action creates an import code for the selected token.
- Import code can be exchanged once.
- Expired or reused import code is rejected.
- LobeHub stores NewAPI `apiKey` and `baseURL` for the authenticated user.
- Opening chat after import can call NewAPI without manual key or URL entry.
- No raw token appears in generated navigation URLs.

## Rollout

1. Implement and deploy Phase 1 first.
2. Verify NewAPI login, OIDC login, logout, registration, and password change.
3. Validate LobeHub's existing settings import behavior.
4. Implement Phase 2 using either the existing import path or the one-time code path.
5. Verify token import and chat readiness with a non-admin user token.
