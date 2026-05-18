# Authentik SSO 统一认证迁移 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 验证并完成 NewAPI + LobeHub 统一 Authentik SSO 认证，修复 LobeHub placeholder secrets。

**Architecture:** NewAPI 已完成 OIDC 集成（oidc_id 已预填，OIDC 已启用，本地登录已关闭）。Authentik 中 Provider/Application/用户均已存在。唯一需要修复的是 LobeHub `.env` 中的 placeholder secrets 和验证所有流程正常工作。

**Tech Stack:** Authentik 2025.10 OIDC, NewAPI (Go), LobeHub (Next.js + Better Auth), Docker Compose, PostgreSQL

---

## 当前状态（已验证）

| 组件 | 状态 |
|------|------|
| Authentik NewAPI OIDC Provider | 已创建，client_id=`newapi`，redirect_uri=`https://matrix.000328.xyz:2053/oauth/oidc` |
| Authentik LobeHub OIDC Provider | 已创建，client_id=`lobehub`，redirect_uri=`https://lobehub.000328.xyz:2053/api/auth/callback/authentik` |
| Authentik 用户 | 23 个用户已创建 |
| NewAPI OIDC 设置 | 已启用，endpoints 已配置 |
| NewAPI 用户 oidc_id | 21 个有邮箱用户已填充（= Authentik username） |
| NewAPI 注册/密码登录 | 已关闭 |
| LobeHub .env secrets | **placeholder 值，需要修复** |

---

### Task 1: 修复 LobeHub Authentik Client Secret

**Files:**
- Modify: `/home/lisa/matrix/lobehub/docker-compose/deploy/.env` (line 10)

当前 `AUTH_AUTHENTIK_SECRET=compose-validation-secret`，需要替换为 Authentik 中 LobeHub Provider 的真实 Client Secret: `VLuN73MaTvndy8Ct6rWz-tyTADGHcFD9t2V887MieWQu9ZQrCTCDr1gQHmZPOiUe`。

- [ ] **Step 1: 更新 .env 中的 AUTH_AUTHENTIK_SECRET**

将 `/home/lisa/matrix/lobehub/docker-compose/deploy/.env` 第 10 行从：
```
AUTH_AUTHENTIK_SECRET=compose-validation-secret
```
改为：
```
AUTH_AUTHENTIK_SECRET=VLuN73MaTvndy8Ct6rWz-tyTADGHcFD9t2V887MieWQu9ZQrCTCDr1gQHmZPOiUe
```

- [ ] **Step 2: 重启 LobeHub 容器**

```bash
cd /home/lisa/matrix/lobehub/docker-compose/deploy && docker compose restart lobehub-local
```

Expected: 容器正常重启，无错误

- [ ] **Step 3: 验证 LobeHub Authentik SSO 登录**

浏览器访问 `https://lobehub.000328.xyz`，确认：
1. 页面显示 "Sign in with Authentik" 按钮
2. 点击后跳转到 `auth.000328.xyz` 登录页
3. 登录后回调到 LobeHub 并成功创建会话

- [ ] **Step 4: Commit**

```bash
git add lobehub/docker-compose/deploy/.env
git commit -m "fix: set real Authentik client secret for LobeHub SSO"
```

---

### Task 2: 修复 LobeHub 其余 placeholder secrets

**Files:**
- Modify: `/home/lisa/matrix/lobehub/docker-compose/deploy/.env` (multiple lines)

检查并修复所有 `compose-validation-*` placeholder 值。

- [ ] **Step 1: 列出所有 placeholder 值**

```bash
grep 'compose-validation' /home/lisa/matrix/lobehub/docker-compose/deploy/.env
```

Expected output:
```
AUTH_AUTHENTIK_SECRET=compose-validation-secret  (已在 Task 1 修复)
NEWAPI_API_KEY=compose-validation-token
KEY_VAULTS_SECRET=compose-validation-key-vaults-secret
AUTH_SECRET=compose-validation-auth-secret
POSTGRES_PASSWORD=compose-validation-postgres-password
S3_ENDPOINT=http://localhost:9000
RUSTFS_ACCESS_KEY=compose-validation-access-key
RUSTFS_SECRET_KEY=compose-validation-secret-key
```

- [ ] **Step 2: 生成并替换 secrets**

需要为以下字段生成随机值：
- `NEWAPI_API_KEY` — 从 NewAPI admin 后台获取或生成一个 API key
- `KEY_VAULTS_SECRET` — 生成 32 字节 hex: `openssl rand -hex 32`
- `AUTH_SECRET` — 生成 32 字节 hex: `openssl rand -hex 32`
- `POSTGRES_PASSWORD` — 检查 LobeHub PostgreSQL 容器当前使用的密码（可能已经初始化，不能随便改）
- `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` — 检查 RustFS 容器当前配置

**注意：** 如果 PostgreSQL 和 RustFS 已经用 placeholder 值初始化，那这些值实际上就是真实密码（容器首次启动时读取了 placeholder 值并用作实际密码）。在这种情况下，容器在运行就说明这些值是"真实"的。需要逐个验证。

- [ ] **Step 3: 重启 LobeHub 容器**

```bash
cd /home/lisa/matrix/lobehub/docker-compose/deploy && docker compose restart lobehub-local
```

- [ ] **Step 4: 验证 LobeHub 仍然正常工作**

访问 `https://lobehub.000328.xyz` 确认服务正常。

- [ ] **Step 5: Commit**

```bash
git add lobehub/docker-compose/deploy/.env
git commit -m "fix: replace remaining placeholder secrets in LobeHub .env"
```

---

### Task 3: 验证 NewAPI OIDC 登录流程

**Files:** 无文件修改，纯验证步骤。

- [ ] **Step 1: 验证 NewAPI status API 返回 OIDC 配置**

```bash
curl -s https://matrix.000328.xyz:2053/api/status | python3 -m json.tool | grep -A5 oidc
```

Expected: `oidc_enabled: true`，`oidc_client_id: "newapi"`，`oidc_authorization_endpoint` 有值

- [ ] **Step 2: 验证 OIDC Well-Known 端点可达**

```bash
curl -s https://auth.000328.xyz/application/o/newapi/.well-known/openid-configuration | python3 -m json.tool | head -10
```

Expected: 返回 JSON 包含 `issuer`、`authorization_endpoint`、`token_endpoint`、`userinfo_endpoint`

- [ ] **Step 3: 测试 OIDC 登录流程**

1. 浏览器访问 `https://matrix.000328.xyz:2053`
2. 确认登录页显示 "使用 OIDC 继续" 按钮
3. 点击按钮，确认跳转到 `auth.000328.xyz` 的认证页面
4. 用一个已迁移的用户登录（如 `umey` / `meygure@gmail.com`）
5. 确认回调后成功登录 NewAPI，且登录用户名与原用户一致（不是新建账号）

- [ ] **Step 4: 验证 oidc_id 匹配**

```bash
docker compose -f /home/lisa/matrix/new-api/docker-compose.yml exec -T postgres psql -U root -d new-api -c "SELECT username, email, oidc_id FROM users WHERE email != '' AND oidc_id != '' ORDER BY id;"
```

Expected: 21 行，每行的 `oidc_id` 等于 Authentik 中的 username

---

### Task 4: 验证 Authentik 端 redirect URI 正确性

**Files:** 无文件修改，可能需要更新 Authentik 配置。

- [ ] **Step 1: 确认 NewAPI redirect URI 与 ServerAddress 匹配**

```bash
# NewAPI ServerAddress
docker compose -f /home/lisa/matrix/new-api/docker-compose.yml exec -T postgres psql -U root -d new-api -c "SELECT value FROM options WHERE key='ServerAddress';"
```

Expected: `https://matrix.000328.xyz:2053`

OIDC redirect URI = `{ServerAddress}/oauth/oidc` = `https://matrix.000328.xyz:2053/oauth/oidc`

- [ ] **Step 2: 确认 Authentik Provider 的 redirect URI 一致**

```bash
docker exec authentik-postgresql psql -U authentik -d authentik -c "SELECT name, redirect_uris FROM authentik_providers_oauth2_oauth2provider;"
```

Expected: newapi provider 的 redirect_uris 包含 `https://matrix.000328.xyz:2053/oauth/oidc`

如果 redirect URI 不匹配，需要通过 Authentik Admin UI 或 API 更新。

---

### Task 5: 更新设计文档标记为已完成

**Files:**
- Modify: `/home/lisa/matrix/docs/superpowers/specs/2026-05-09-authentik-sso-migration-design.md`

- [ ] **Step 1: 更新 spec 状态**

将 spec 头部状态从 `已批准` 改为 `已完成`，添加实际完成情况说明。

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-09-authentik-sso-migration-design.md
git commit -m "docs: mark Authentik SSO migration spec as completed"
```
