# NewAPI Authentik Return and Token Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NewAPI the stable login/register/logout entrypoint, fix Authentik password-change return handling, and make NewAPI token chat links prefill LobeHub with the selected token and NewAPI URL.

**Architecture:** Phase 1 removes backend auto-redirects from NewAPI `/login` and `/register`, keeps OIDC behind the explicit frontend button, and makes logout return to NewAPI. Phase 2 uses LobeHub's existing `settings` import path for immediate token prefill, while keeping token exposure constrained to the shortest feasible navigation path and verifying no raw token remains in generated links after import. Authentik still owns OIDC login and password change, but NewAPI owns UI routing.

**Tech Stack:** Go + Gin + GORM for NewAPI backend, React/Vite for NewAPI frontend, Next/React for LobeHub import behavior, Vitest/Jest-style frontend tests, Go `testing`/`httptest` backend tests.

---

## File Structure

- Modify: `new-api/router/web-router.go`
  - Responsibility: serve NewAPI SPA routes for `/login` and `/register`; do not auto-redirect these routes to Authentik.
- Modify: `new-api/router/web_router_test.go`
  - Responsibility: assert `/login` and `/register` serve the web app without `Location` redirects.
- Modify: `new-api/web/src/hooks/common/useHeaderBar.js`
  - Responsibility: logout behavior in the header; clear NewAPI session and navigate to `/login`.
- Modify: `new-api/web/src/components/settings/PersonalSetting.jsx`
  - Responsibility: password-change link target.
- Create: `new-api/web/src/helpers/lobehubImport.js`
  - Responsibility: build LobeHub import URLs from a selected NewAPI token and base URL.
- Create: `new-api/web/src/test/helpers/lobehubImport.test.js`
  - Responsibility: verify import URL format and keyVault payload.
- Modify: `new-api/web/src/pages/Chat2Link/index.jsx`
  - Responsibility: redirect to LobeHub using the selected or first available NewAPI token in LobeHub's supported `settings.keyVaults.newapi` format.
- Modify: `new-api/web/src/hooks/tokens/useTokensData.jsx`
  - Responsibility: token row "聊天" action resolves the clicked row token and uses the same LobeHub import URL helper.
- Test: `new-api/web/src/test/hooks/useHeaderBar.test.jsx` if an existing test harness is available; otherwise test logout via the closest existing header/user-area test file.
- Verify: `lobehub/src/layout/GlobalProvider/ImportSettings.tsx`
  - Responsibility: existing LobeHub support for `settings.keyVaults` import. No planned code change unless verification shows the route loses settings after Authentik login.

## Task 1: Restore NewAPI Login and Register Routes

**Files:**
- Modify: `new-api/router/web-router.go`
- Modify: `new-api/router/web_router_test.go`

- [ ] **Step 1: Replace backend route tests for `/login` and `/register`**

Edit `new-api/router/web_router_test.go`.

Replace `TestRegisterRedirectsToAuthentikEnrollment` with:

```go
func TestRegisterServesNewAPIRegisterPage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	SetWebRouter(r, testBuildFS, []byte("index"))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/register", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, w.Code)
	}
	if got := w.Header().Get("Location"); got != "" {
		t.Fatalf("expected no Location header, got %q", got)
	}
	if got := w.Body.String(); got != "index" {
		t.Fatalf("expected index page %q, got %q", "index", got)
	}
}
```

Replace `TestLoginRedirectsToAuthentikOIDC` with:

```go
func TestLoginServesNewAPILoginPage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	store := cookie.NewStore([]byte("test-secret"))
	r.Use(sessions.Sessions("session", store))
	SetWebRouter(r, testBuildFS, []byte("index"))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/login", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, w.Code)
	}
	if got := w.Header().Get("Location"); got != "" {
		t.Fatalf("expected no Location header, got %q", got)
	}
	if got := w.Body.String(); got != "index" {
		t.Fatalf("expected index page %q, got %q", "index", got)
	}
}
```

Delete now-unused imports from `new-api/router/web_router_test.go`:

```go
	"net/url"
	"strings"
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
cd /home/lisa/matrix/new-api && go test ./router -run 'Test(RegisterServesNewAPIRegisterPage|LoginServesNewAPILoginPage|LoginLogoutQueryServesNewAPILoginPage)' -count=1
```

Expected: FAIL. `/login` and `/register` still return `302 Found`.

- [ ] **Step 3: Remove hardcoded Authentik web redirects**

Edit `new-api/router/web-router.go`.

Remove this import:

```go
	"net/url"
```

Remove these constants and helper:

```go
const authentikRegistrationURL = "https://auth.000328.xyz:2053/if/flow/self-service-enrollment/?next=https%3A%2F%2Fmatrix.000328.xyz%3A2053%2Flogin"
const authentikAuthorizationURL = "https://auth.000328.xyz:2053/application/o/authorize/"

func newAuthentikLoginURL(state string) string {
	values := url.Values{}
	values.Set("client_id", "newapi")
	values.Set("redirect_uri", "https://matrix.000328.xyz:2053/oauth/oidc")
	values.Set("response_type", "code")
	values.Set("scope", "openid profile email")
	values.Set("state", state)
	return authentikAuthorizationURL + "?" + values.Encode()
}
```

Replace the start of `SetWebRouter` with:

```go
func SetWebRouter(router *gin.Engine, buildFS embed.FS, indexPage []byte) {
	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	router.Use(static.Serve("/", common.EmbedFolder(buildFS, "web/dist")))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexPage)
	})
}
```

Keep `net/http` imported because the `NoRoute` handler still uses `http.StatusOK`.

- [ ] **Step 4: Run route tests and verify they pass**

Run:

```bash
cd /home/lisa/matrix/new-api && go test ./router -run 'Test(RegisterServesNewAPIRegisterPage|LoginServesNewAPILoginPage|LoginLogoutQueryServesNewAPILoginPage)' -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit Phase 1 backend route fix**

Run:

```bash
cd /home/lisa/matrix && git add new-api/router/web-router.go new-api/router/web_router_test.go && git commit -m "fix: serve NewAPI login and register pages"
```

## Task 2: Fix NewAPI Logout and Password-Change Return URL

**Files:**
- Modify: `new-api/web/src/hooks/common/useHeaderBar.js`
- Modify: `new-api/web/src/components/settings/PersonalSetting.jsx`
- Test: nearest existing frontend tests for these modules, or add focused tests if mocks already exist

- [ ] **Step 1: Check for an existing logout test harness**

Search first:

```bash
cd /home/lisa/matrix/new-api/web && rg -n "useHeaderBar|logout\\(" src/test src -g '*test*'
```

Expected in the current codebase: no focused `useHeaderBar` test harness exists. Cover this small behavior change with the manual verification in Step 4 and the frontend smoke tests in Step 4. Do not create a broad hook testing harness only for this logout change.

- [ ] **Step 2: Simplify logout implementation**

Edit `new-api/web/src/hooks/common/useHeaderBar.js`.

Replace the `logout` callback body with:

```jsx
  const logout = useCallback(async () => {
    await API.get('/api/user/logout');
    showSuccess(t('注销成功!'));
    userDispatch({ type: 'logout' });
    localStorage.removeItem('user');
    navigate('/login');
  }, [navigate, t, userDispatch]);
```

This intentionally removes `oidc_end_session_endpoint` usage from NewAPI logout.

- [ ] **Step 3: Normalize the Authentik password-change URL**

Edit `new-api/web/src/components/settings/PersonalSetting.jsx`.

Keep the fixed return URL, but build it with `encodeURIComponent` to avoid double-encoding mistakes:

```jsx
const AUTHENTIK_PASSWORD_CHANGE_RETURN_URL =
  'https://matrix.000328.xyz:2053/setting/personal';

const AUTHENTIK_PASSWORD_CHANGE_URL = `https://auth.000328.xyz:2053/if/flow/default-password-change/?next=${encodeURIComponent(
  AUTHENTIK_PASSWORD_CHANGE_RETURN_URL,
)}`;
```

Keep the click handler:

```jsx
  const changePassword = () => {
    window.location.href = AUTHENTIK_PASSWORD_CHANGE_URL;
  };
```

- [ ] **Step 4: Run frontend verification**

Run:

```bash
cd /home/lisa/matrix/new-api/web && bunx vitest run src/test/helpers/chatLink.test.js src/test/hooks/useTokenKeys.test.jsx
```

Expected: PASS. These are smoke tests for nearby helper/hook behavior.

Manual browser check after deployment:

```text
1. Log in to NewAPI.
2. Click logout.
3. Confirm the browser lands on /login and stays on the NewAPI login page.
4. Log in again.
5. Open personal settings and click password change.
6. Confirm Authentik opens the password-change flow.
7. After changing the password, confirm Authentik returns to https://matrix.000328.xyz:2053/setting/personal.
```

Authentik deployment setting required:

```text
Allow next/return URL: https://matrix.000328.xyz:2053/setting/personal
```

- [ ] **Step 5: Commit logout and password-change fix**

Run:

```bash
cd /home/lisa/matrix && git add new-api/web/src/hooks/common/useHeaderBar.js new-api/web/src/components/settings/PersonalSetting.jsx && git commit -m "fix: return NewAPI logout and password change to NewAPI"
```

## Task 3: Add a Shared LobeHub Import URL Builder in NewAPI

**Files:**
- Create: `new-api/web/src/helpers/lobehubImport.js`
- Create: `new-api/web/src/test/helpers/lobehubImport.test.js`

- [ ] **Step 1: Write tests for the import URL builder**

Create `new-api/web/src/test/helpers/lobehubImport.test.js`:

```js
import { describe, expect, it } from 'vitest';

import {
  buildLobeHubNewAPIImportSettings,
  buildLobeHubNewAPIImportUrl,
  normalizeNewAPIBaseURL,
  normalizeNewAPIToken,
} from '../../helpers/lobehubImport';

describe('lobehubImport', () => {
  it('normalizes NewAPI tokens to sk-prefixed keys', () => {
    expect(normalizeNewAPIToken('abc123')).toBe('sk-abc123');
    expect(normalizeNewAPIToken('sk-abc123')).toBe('sk-abc123');
    expect(normalizeNewAPIToken('  sk-abc123  ')).toBe('sk-abc123');
  });

  it('normalizes base URLs without trailing slash', () => {
    expect(normalizeNewAPIBaseURL('https://matrix.000328.xyz:3000/')).toBe(
      'https://matrix.000328.xyz:3000',
    );
  });

  it('builds LobeHub keyVault settings for NewAPI provider', () => {
    expect(
      buildLobeHubNewAPIImportSettings({
        baseURL: 'https://matrix.000328.xyz:3000/',
        token: 'abc123',
      }),
    ).toEqual({
      keyVaults: {
        newapi: {
          apiKey: 'sk-abc123',
          baseURL: 'https://matrix.000328.xyz:3000',
        },
      },
    });
  });

  it('builds an encoded LobeHub import URL', () => {
    const url = buildLobeHubNewAPIImportUrl({
      baseURL: 'https://matrix.000328.xyz:3000/',
      chatLink: 'https://lobehub.000328.xyz/',
      token: 'abc123',
    });

    expect(url.startsWith('https://lobehub.000328.xyz/?settings=')).toBe(true);
    const encoded = new URL(url).searchParams.get('settings');
    expect(JSON.parse(encoded)).toEqual({
      keyVaults: {
        newapi: {
          apiKey: 'sk-abc123',
          baseURL: 'https://matrix.000328.xyz:3000',
        },
      },
    });
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd /home/lisa/matrix/new-api/web && bunx vitest run src/test/helpers/lobehubImport.test.js
```

Expected: FAIL because `../../helpers/lobehubImport` does not exist.

- [ ] **Step 3: Implement the helper**

Create `new-api/web/src/helpers/lobehubImport.js`:

```js
export function normalizeNewAPIToken(token) {
  const trimmed = String(token || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('sk-') ? trimmed : `sk-${trimmed}`;
}

export function normalizeNewAPIBaseURL(baseURL) {
  return String(baseURL || '').trim().replace(/\/+$/, '');
}

export function normalizeLobeHubURL(chatLink) {
  return String(chatLink || '').trim().replace(/\/+$/, '');
}

export function buildLobeHubNewAPIImportSettings({ token, baseURL }) {
  return {
    keyVaults: {
      newapi: {
        apiKey: normalizeNewAPIToken(token),
        baseURL: normalizeNewAPIBaseURL(baseURL),
      },
    },
  };
}

export function buildLobeHubNewAPIImportUrl({ chatLink, token, baseURL }) {
  const lobeHubURL = normalizeLobeHubURL(chatLink);
  const settings = buildLobeHubNewAPIImportSettings({ token, baseURL });
  return `${lobeHubURL}/?settings=${encodeURIComponent(JSON.stringify(settings))}`;
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
cd /home/lisa/matrix/new-api/web && bunx vitest run src/test/helpers/lobehubImport.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit helper**

Run:

```bash
cd /home/lisa/matrix && git add new-api/web/src/helpers/lobehubImport.js new-api/web/src/test/helpers/lobehubImport.test.js && git commit -m "feat: build LobeHub NewAPI import links"
```

## Task 4: Use Selected Token in NewAPI Chat Links

**Files:**
- Modify: `new-api/web/src/pages/Chat2Link/index.jsx`
- Modify: `new-api/web/src/hooks/tokens/useTokensData.jsx`
- Test: `new-api/web/src/test/helpers/lobehubImport.test.js`

- [ ] **Step 1: Update Chat2Link to use LobeHub keyVault settings**

Edit `new-api/web/src/pages/Chat2Link/index.jsx`.

Add import:

```jsx
import { buildLobeHubNewAPIImportUrl } from '../../helpers/lobehubImport';
```

Replace `comLink` with:

```jsx
  const comLink = (key) => {
    if (!chatLink || !serverAddress || !key) return '';
    return buildLobeHubNewAPIImportUrl({
      baseURL: serverAddress,
      chatLink,
      token: key,
    });
  };
```

This replaces the old payload:

```json
{"key":"sk-...","url":"..."}
```

with the LobeHub-supported payload:

```json
{"keyVaults":{"newapi":{"apiKey":"sk-...","baseURL":"..."}}}
```

- [ ] **Step 2: Update token-row chat action to use the same helper**

Edit `new-api/web/src/hooks/tokens/useTokensData.jsx`.

Add this import near the existing helper imports:

```jsx
import { buildLobeHubNewAPIImportUrl } from '../../helpers/lobehubImport';
```

Inside `onOpenLink`, keep the existing `ccswitch`, `fluent`, `{cherryConfig}`, and `{aionuiConfig}` branches. Replace only the final generic `else` branch:

```jsx
    } else if (url.includes('lobehub') || url === localStorage.getItem('lobehub_chat_url')) {
      url = buildLobeHubNewAPIImportUrl({
        baseURL: serverAddress,
        chatLink: url,
        token: fullKey,
      });
    } else {
      // Replace template variables with raw values first
      url = url.replaceAll('{key}', `sk-${fullKey}`);
      url = url.replaceAll('{address}', serverAddress);
      // Let URL constructor properly encode query params
      try {
        url = new URL(url).toString();
      } catch (_) {}
    }
```

Keep the existing final open call:

```jsx
    window.open(url, '_blank');
```

The clicked token row already supplies `record`, and `const fullKey = await fetchTokenKey(record);` at the top of `onOpenLink` resolves the selected row token. Do not change that part.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
cd /home/lisa/matrix/new-api/web && bunx vitest run src/test/helpers/lobehubImport.test.js src/test/hooks/useTokenKeys.test.jsx
```

Expected: PASS.

- [ ] **Step 4: Manual verify the generated token chat URL**

In NewAPI after deployment:

```text
1. Open /console/token.
2. Select a known enabled token row.
3. Click 聊天.
4. Confirm the browser opens LobeHub with a settings query parameter.
5. Decode the settings value and confirm it contains:
   keyVaults.newapi.apiKey = sk-<selected token>
   keyVaults.newapi.baseURL = <current NewAPI URL>
6. Confirm it does not use the first unrelated token when a specific token row was clicked.
```

- [ ] **Step 5: Commit selected-token chat link**

Run:

```bash
cd /home/lisa/matrix && git add new-api/web/src/pages/Chat2Link/index.jsx new-api/web/src/hooks/tokens/useTokensData.jsx && git commit -m "feat: prefill LobeHub from selected NewAPI token"
```

## Task 5: Verify LobeHub Settings Import Persists After Authentik Login

**Files:**
- Inspect: `lobehub/src/layout/GlobalProvider/ImportSettings.tsx`
- Modify only if needed: `lobehub/src/layout/GlobalProvider/ImportSettings.tsx`

- [ ] **Step 1: Confirm current LobeHub import behavior**

Read `lobehub/src/layout/GlobalProvider/ImportSettings.tsx` and confirm these behaviors are present:

```tsx
const PENDING_SETTINGS_KEY = 'lobe_pending_settings';
```

```tsx
if (param) {
  localStorage.setItem(PENDING_SETTINGS_KEY, param);
  params.delete(LOBE_URL_IMPORT_NAME);
  const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', newUrl);
}
```

```tsx
if (parsed.keyVaults && typeof parsed.keyVaults === 'object') {
  const updateAiProviderConfig = useAiInfraStore.getState().updateAiProviderConfig;
  for (const [provider, vaults] of Object.entries(parsed.keyVaults)) {
    if (vaults && typeof vaults === 'object') {
      await updateAiProviderConfig(provider, {
        keyVaults: vaults as Record<string, string>,
      });
    }
  }
}
```

Expected: These snippets already exist. If they do, no code change is needed in this task.

- [ ] **Step 2: Manual verify Authentik login does not drop pending settings**

Use a test URL with a harmless fake key:

```text
https://lobehub.000328.xyz/?settings=%7B%22keyVaults%22%3A%7B%22newapi%22%3A%7B%22apiKey%22%3A%22sk-test-import%22%2C%22baseURL%22%3A%22https%3A%2F%2Fmatrix.000328.xyz%3A3000%22%7D%7D%7D
```

Steps:

```text
1. Open the URL in a browser with no active LobeHub session.
2. Complete Authentik login.
3. Confirm LobeHub loads.
4. Open provider settings for NewAPI.
5. Confirm apiKey and baseURL are present for the authenticated user.
6. Confirm the browser URL no longer contains the settings query parameter.
```

- [ ] **Step 3: Patch LobeHub only if pending settings are lost**

If Step 2 fails because `lobe_pending_settings` is cleared before login completes, keep pending settings until `isUserStateInit` is true and `updateAiProviderConfig` succeeds.

Use this replacement for the second `useEffect` in `ImportSettings.tsx`:

```tsx
  useEffect(() => {
    if (!searchParam || !isUserStateInit) return;

    const applySettings = async () => {
      let imported = false;
      try {
        const parsed = JSON.parse(searchParam);

        if (parsed.keyVaults && typeof parsed.keyVaults === 'object') {
          const updateAiProviderConfig = useAiInfraStore.getState().updateAiProviderConfig;
          for (const [provider, vaults] of Object.entries(parsed.keyVaults)) {
            if (vaults && typeof vaults === 'object') {
              await updateAiProviderConfig(provider, {
                keyVaults: vaults as Record<string, string>,
              });
              imported = true;
            }
          }
        }
      } catch {
        await importUrlShareSettings(searchParam);
        imported = true;
      }

      if (imported) {
        localStorage.removeItem(PENDING_SETTINGS_KEY);
        window.location.reload();
      }
    };

    applySettings();
  }, [searchParam, isUserStateInit, importUrlShareSettings]);
```

- [ ] **Step 4: Run LobeHub targeted checks**

Run:

```bash
cd /home/lisa/matrix/lobehub && pnpm test -- ImportSettings
```

If no matching test target exists, run:

```bash
cd /home/lisa/matrix/lobehub && pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Commit only if LobeHub was changed**

If `ImportSettings.tsx` was modified, run:

```bash
cd /home/lisa/matrix && git add lobehub/src/layout/GlobalProvider/ImportSettings.tsx && git commit -m "fix: persist LobeHub imported provider settings"
```

If no LobeHub change was needed, do not create an empty commit.

## Task 6: Full Verification and Deployment Notes

**Files:**
- No code files unless a verification failure identifies a concrete bug.

- [ ] **Step 1: Run NewAPI backend route tests**

Run:

```bash
cd /home/lisa/matrix/new-api && go test ./router -count=1
```

Expected: PASS.

- [ ] **Step 2: Run NewAPI frontend targeted tests**

Run:

```bash
cd /home/lisa/matrix/new-api/web && bunx vitest run src/test/helpers/lobehubImport.test.js src/test/helpers/chatLink.test.js src/test/hooks/useTokenKeys.test.jsx
```

Expected: PASS.

- [ ] **Step 3: Run formatting if configured**

Check available scripts:

```bash
cd /home/lisa/matrix/new-api/web && npm pkg get scripts
```

If a formatter script exists, run it. If only lint/test scripts exist, run the targeted tests from Step 2 and do not introduce unrelated formatting churn.

- [ ] **Step 4: Verify runtime behavior manually**

Use these production checks:

```text
1. Open https://matrix.000328.xyz:2053/login.
   Expected: NewAPI login page, no automatic Authentik redirect.

2. Click the OIDC login button.
   Expected: Authentik login opens; after success, user returns to NewAPI.

3. Log out from NewAPI.
   Expected: browser lands on NewAPI /login and stays there.

4. Open https://matrix.000328.xyz:2053/register.
   Expected: NewAPI register page or NewAPI disabled-registration state, no automatic Authentik login redirect.

5. Open personal settings and click password change.
   Expected: Authentik password-change flow opens; after success, Authentik returns to NewAPI.

6. Open /console/token and click 聊天 for a selected token.
   Expected: LobeHub opens; after Authentik login, NewAPI provider key and baseURL are configured.

7. Send a small LobeHub chat request.
   Expected: request succeeds through NewAPI using the selected token's quota/access rules.
```

- [ ] **Step 5: Check logs for token exposure**

Run on the deployed host:

```bash
sudo grep -E "sk-|settings=.*apiKey|settings=.*keyVaults" /var/log/nginx/access.log | tail -20
```

Expected for the fast import path: the initial navigation may include encoded `settings`. If nginx logs full query strings, this confirms the deployment should move to the one-time code flow next. It does not block the immediate functional fix if the operator accepts this temporary exposure.

- [ ] **Step 6: Record Authentik configuration**

Record the required Authentik change in deployment notes:

```text
Password-change flow must allow:
https://matrix.000328.xyz:2053/setting/personal
```

If Authentik rejects that URL, use the Authentik UI/API to allow the NewAPI origin or the exact return URL for the password-change flow.

- [ ] **Step 7: Final commit if verification caused documentation changes**

If deployment notes were added to a repo file, commit them:

```bash
cd /home/lisa/matrix && git add <changed-doc-file> && git commit -m "docs: record Authentik return URL requirement"
```

Do not commit runtime secrets, `.env` secrets, or decoded API tokens.

## Self-Review

Spec coverage:

- NewAPI `/login` default page: Task 1.
- NewAPI `/register` default page: Task 1.
- OIDC only from button: Task 1 preserves frontend OAuth helpers and removes backend auto-redirect.
- Logout returns to NewAPI `/login`: Task 2.
- Password-change fixed `next`: Task 2 and Task 6.
- Selected token and NewAPI URL imported into LobeHub: Tasks 3 and 4.
- Authentik login before LobeHub import persistence: Task 5.
- Token exposure verification: Task 6.

Completeness scan:

- All implementation steps name concrete files, commands, and expected outcomes.

Type consistency:

- NewAPI token key format is `sk-<key>` in frontend import payload.
- LobeHub provider id is `newapi`.
- LobeHub keyVault fields are `apiKey` and `baseURL`, matching `buildPayloadFromKeyVaults`.
