# Authentik SSO 统一认证迁移设计

**日期：** 2026-05-09
**状态：** 已批准

## 目标

将 NewAPI 和 LobeHub 的用户认证统一迁移到 Authentik SSO，保留 NewAPI 本地登录作为过渡。

## 当前状态

| 服务 | 地址 | 认证方式 | Authentik SSO |
|------|------|---------|---------------|
| Authentik | `auth.000328.xyz` | 本地 | — |
| LobeHub | `lobehub.000328.xyz` | Authentik OIDC（已配置，secret 为 placeholder） | 已集成 |
| NewAPI | `matrix.000328.xyz:3000` | 本地账号密码 | 未集成 |

NewAPI 共 23 个活跃用户（含 admin），其中 21 个有邮箱，`wubinstu` 和 `admin` 无邮箱。

## 方案：内置 OIDC + 迁移脚本预填 oidc_id

选择 NewAPI 内置 OIDC 功能接入 Authentik，通过迁移脚本预填 `oidc_id` 关联已有用户，无需修改 NewAPI 源码。

### 关键约束

- NewAPI OIDC 通过 `users.oidc_id`（存储 Authentik `sub` claim）匹配用户，不按邮箱匹配
- 首次 OIDC 登录且 `oidc_id` 未关联时，会创建新账号（即使邮箱相同）
- 因此必须在用户首次 OIDC 登录前，预先将 Authentik `sub` 写入 `oidc_id`

### 执行步骤

#### Step 1: Authentik — 创建 NewAPI OIDC Provider + Application

- 创建 OIDC Provider:
  - Name: `NewAPI`
  - Client ID: `newapi`
  - Client Secret: 生成强密码
  - Redirect URIs: `https://matrix.000328.xyz:3000/oauth/oidc`
  - Scopes: `openid email profile`
- 创建 Application 绑定该 Provider，分配到默认 Outpost

#### Step 2: Authentik — 批量创建用户

在 Authentik 中为 21 个有邮箱的 NewAPI 用户创建账号：

| 用户 | 邮箱 |
|------|------|
| admin | root@example.com（已存在为 akadmin） |
| LetYouFlyUp | 2633739128@qq.com |
| umey | meygure@gmail.com |
| glen | 2292873772@qq.com |
| feng | 15956019960@163.com |
| fan_tangCK | 2249498893@qq.com |
| hixx | imxudaye@qq.com |
| Xxx | xiade163@163.com |
| mikmyp | 2836365261@qq.com |
| AceCool | 550026258@qq.com |
| tangtang | heerjohn379@gmail.com |
| Augenstern | 1790027405@qq.com |
| manchutd | manchutd@163.com |
| Wilde | wangrui809370225@gmail.com |
| 1845194320 | 1845194320@qq.com |
| mark_up | maxf_33@163.com |
| shuangxunian | shuangxunian@gmail.com |
| lz | leizhang.work@aliyun.com |
| 莫离 | 3215538573@qq.com |
| Quard | cquard@163.com |
| hevin | 675706548@qq.com |

**特殊情况：**
- `admin`（id=1）已存在为 Authentik 的 `akadmin`（email: root@example.com），直接关联
- `wubinstu`（id=66）无邮箱，需要单独处理（联系用户补邮箱或手动创建）

创建用户时设置随机初始密码，通知用户首次登录后修改。

#### Step 3: Authentik API — 获取用户 sub ID 映射

通过 Authentik Admin API 获取每个用户的 `pk`（即 OIDC `sub` claim），构建邮箱 → sub 映射表。

```
GET /api/v3/core/users/
```

#### Step 4: NewAPI DB — 更新 users.oidc_id

用映射表执行 SQL 更新：

```sql
UPDATE users SET oidc_id = '<authentik_sub>' WHERE email = '<user_email>';
-- admin 特殊处理
UPDATE users SET oidc_id = '<akadmin_pk>' WHERE username = 'admin';
```

#### Step 5: NewAPI — 启用 OIDC 设置

通过 NewAPI Admin 后台或 API 配置 OIDC：

| 设置 | 值 |
|------|---|
| `OIDCEnabled` | `true` |
| `ClientId` | `newapi` |
| `ClientSecret` | Step 1 生成的密码 |
| `WellKnown` | `https://auth.000328.xyz/application/o/newapi/.well-known/openid-configuration` |

Authorization/Token/UserInfo endpoints 通过 well-known 自动发现。

#### Step 6: LobeHub — 更新真实 Client Secret

更新 `/home/lisa/matrix/lobehub/docker-compose/deploy/.env` 中的：
- `AUTH_AUTHENTIK_SECRET`：替换 `compose-validation-secret` 为 Authentik 中 LobeHub Application 的真实 Client Secret

然后重启 LobeHub 容器。

#### Step 7: 测试验证

1. 测试 NewAPI OIDC 登录：用已有用户通过 Authentik 登录，确认关联到正确账号
2. 测试 NewAPI 本地登录：确认仍可正常使用
3. 测试 LobeHub Authentik 登录：确认 SSO 正常
4. 确认 NewAPI 中 "使用 OIDC 继续" 按钮显示正常

### 保留的本地登录

- `RegisterEnabled`、`PasswordRegisterEnabled`、`PasswordLoginEnabled` 保持开启
- 用户可选择本地密码登录或 Authentik OIDC 登录
- 后续稳定后可考虑关闭本地注册和登录

### 风险和注意事项

- `wubinstu` 无邮箱，需单独处理
- 迁移过程不影响现有本地密码登录
- Authentik 批量创建用户的初始密码需安全传达给用户
- LobeHub `.env` 中多个值为 placeholder，需逐一替换为真实值才能正常运行
