# 统一 HTTP MCP 设计：MiMo 多模态 + Web + gpt-image-2

日期：2026-05-06

## 1. 背景与目标

当前工作区里已经存在两套相关原型：

- `mimo-web-mcp`：Node/TypeScript，本地 stdio MCP，提供 MiMo 网页检索与网页阅读工具。
- `mcp-gpt-image2`：Python，简化版 HTTP MCP，提供 `generate_image` 工具并转发到现有 OpenAI-compatible gateway 的 `/v1/images/generations`。

用户希望把以下能力统一整合成一个可公网访问的 HTTP MCP 服务，并部署到：

- `https://matrix.000328.xyz:2053/mcp`

同时需要提供可以直接接入以下客户端的安装材料：

- Claude Code
- Codex 类支持 HTTP MCP 的客户端

第一版范围限定为：

1. MiMo 网页检索/网页阅读
2. MiMo 图片理解
3. MiMo 音频理解
4. MiMo 视频理解
5. gpt-image-2 文生图

明确约束：

- 服务端入口统一为单一 HTTP MCP 入口
- 认证复用现有 `new-api` Bearer token
- 多模态输入第一版以公网 URL 为主，不支持本地文件上传
- 工具输出采用轻量风格，默认返回整理后的文本结果和少量结构化字段，不返回大块原始上游 JSON

## 2. 非目标

第一版不做以下内容：

- 不并入 `new-api` Go 主服务本体
- 不额外引入独立用户体系或单独的 MCP token
- 不支持图片/音频/视频本地文件上传
- 不实现通用聊天型 MCP 工具
- 不默认暴露详细 usage/debug 原始响应
- 不在第一版处理多客户端的深度差异化协议兼容层；优先提供统一服务端和按客户端拆分的安装模板

## 3. 推荐方案

采用“独立单体 HTTP MCP 聚合服务”方案。

### 3.1 总体思路

新建一个独立项目，例如：

- `/home/lisa/matrix/mimo-unified-mcp`

该项目作为统一 MCP 服务入口，内部聚合：

- 现有 `mimo-web-mcp` 的 Web 能力
- 现有 `mcp-gpt-image2` 的图像生成能力
- 新增 MiMo 图片/音频/视频理解能力

对外只暴露一个 HTTP MCP 入口：

- `https://matrix.000328.xyz:2053/mcp`

### 3.2 为什么不选其他方案

不直接把 MCP 做进 `new-api`：

- 会把 MCP 协议处理、多工具编排、多模态网关职责塞进 Go 主服务
- 现有能力分散在 Node 和 Python，硬并入 Go 会增加维护复杂度
- 影响面更大，失败隔离更差

不做“仅网关转发到多个独立 MCP 服务”：

- 内部链路更长
- 调试更复杂
- 第一版更适合收口成一个正式服务，而不是继续保留多个风格不一致的原型

## 4. 技术选型

统一采用：

- Node.js
- TypeScript
- `@modelcontextprotocol/sdk`

原因：

1. 现有 `mimo-web-mcp` 已经是 Node/TypeScript，可平滑迁移代码
2. MCP 官方 SDK 在 Node 上更成熟，适合实现标准 HTTP MCP / Streamable HTTP
3. 比维持 Node + Python 双栈服务更利于长期维护

## 5. 服务端架构

### 5.1 三层结构

服务端按三层组织：

1. **transport 层**
   - 处理 MCP `initialize` / `tools/list` / `tools/call`
   - 统一认证入口
   - 统一请求 ID、日志、错误格式
   - 提供 `/health`

2. **tool 层**
   - 每个工具负责参数校验
   - 调用 provider
   - 整理轻量输出

3. **provider 层**
   - `mimo provider`：负责 MiMo 网页检索、网页阅读、图片理解、音频理解、视频理解
   - `new-api provider`：负责 `gpt-image-2` 图片生成，以及 token 校验/与现有 gateway 的交互

### 5.2 建议目录结构

```text
mimo-unified-mcp/
  src/
    server/
      http.ts
      mcp.ts
      auth.ts
      errors.ts
      health.ts
    config/
      env.ts
    providers/
      mimo/
        client.ts
        web.ts
        multimodal.ts
      newapi/
        client.ts
        images.ts
        token.ts
    tools/
      mimo-web-search.ts
      mimo-web-reader.ts
      mimo-web-search-reader.ts
      mimo-image-understand.ts
      mimo-audio-understand.ts
      mimo-video-understand.ts
      generate-image.ts
    util/
      url-safety.ts
      logging.ts
      output.ts
  clients/
    claude-code/
    codex/
  Dockerfile
  README.md
  .env.example
```

该结构保证每类职责边界明确，后续新增工具时只需新增 tool 与 provider 的局部实现。

## 6. MCP 对外入口与协议

### 6.1 入口

统一入口：

- `https://matrix.000328.xyz:2053/mcp`

该入口由 nginx 转发到本地独立服务，例如：

- `127.0.0.1:8765`

### 6.2 协议形态

服务实现标准 HTTP MCP，优先采用 Node MCP SDK 支持的 Streamable HTTP 方案，以兼容现代 MCP 客户端。

要求支持至少以下 MCP 基础行为：

- `initialize`
- `tools/list`
- `tools/call`
- `ping`（若客户端或 SDK 使用）

### 6.3 健康检查

额外提供：

- `GET /health`

返回简单健康信息，供 docker healthcheck、nginx 排查和本地运维使用。

## 7. 工具清单

第一版固定 7 个工具：

1. `mimo_web_search`
2. `mimo_web_reader`
3. `mimo_web_search_reader`
4. `mimo_image_understand`
5. `mimo_audio_understand`
6. `mimo_video_understand`
7. `generate_image`

### 7.1 Web 工具

#### `mimo_web_search`

用途：

- 调用 MiMo 的联网搜索能力，对查询进行搜索和总结

输入：

- `query`：必填，搜索内容
- `site`：可选，限制站点
- `time_range`：可选，时间范围
- `summary_length`：可选，默认 `medium`

输出：

- 主体文本总结
- `sources`
- `query_used`

#### `mimo_web_reader`

用途：

- 读取指定 URL，必要时回退到 MiMo 的联网理解路径

输入：

- `url`：必填
- `question`：可选，对页面内容的提问

输出：

- 页面摘要或答案
- `source_url`
- `fallback_used`

#### `mimo_web_search_reader`

用途：

- 先围绕主题搜索，再综合阅读结果进行总结

输入：

- `query`：必填
- `focus`：可选
- `site`：可选

输出：

- 综合结论
- `sources`

### 7.2 多模态理解工具

三种工具统一采用“URL + prompt”为主的参数风格。

#### `mimo_image_understand`

输入：

- `url`：必填，公网图片地址
- `prompt`：必填，理解指令
- `model`：可选

输出：

- 整理后的文本答案
- `source_url`

#### `mimo_audio_understand`

输入：

- `url`：必填，公网音频地址
- `prompt`：必填，理解指令
- `model`：可选

输出：

- 整理后的文本答案
- `source_url`

#### `mimo_video_understand`

输入：

- `url`：必填，公网视频地址
- `prompt`：必填，理解指令
- `model`：可选

输出：

- 整理后的文本答案
- `source_url`

### 7.3 图像生成工具

#### `generate_image`

用途：

- 调用现有 OpenAI-compatible gateway 的 `/v1/images/generations`，使用 `gpt-image-2` 生成图片并保存到服务端输出目录

输入：

- `prompt`：必填
- `size`：可选
- `quality`：可选
- `output_name`：可选

输出：

- 简短结果说明
- `path`
- `model`
- `size`
- `quality`

## 8. 参数与输出规范

### 8.1 参数规范

工具参数统一收敛为两类风格：

- 检索类：`query`, `site`, `time_range`
- 理解类：`url`, `prompt`, `model`

这样可以减少客户端心智负担，便于文档与示例统一。

### 8.2 输出规范

所有工具默认返回轻量风格结果：

- 适合模型直接消费的文本结果
- 少量结构化字段

不默认返回：

- 原始上游 JSON
- 大块 usage/debug 细节
- 大体积中间数据

如果后续需要调试模式，可以作为后续版本扩展，但不纳入第一版范围。

## 9. 认证设计

### 9.1 认证模式

复用现有 `new-api` Bearer token。

客户端连接 `https://matrix.000328.xyz:2053/mcp` 时带：

- `Authorization: Bearer <token>`

统一 MCP 服务本身不维护独立用户体系。

### 9.2 认证流程

1. transport 层从请求头中提取 Bearer token
2. 调用 `new-api` 的轻量校验路径验证 token 是否可用
3. 校验通过后，将 token 放入当前请求上下文
4. 后续 provider 调用时按需要复用该 token

### 9.3 provider 中的 token 使用

- `generate_image`：继续把 token 透传给 `new-api /v1/images/generations`
- MiMo Web / 多模态能力：优先按服务端配置访问对应 MiMo upstream
- 若后续希望统一经由 `new-api` 代理，也保留该演进空间，但不是第一版前提

### 9.4 认证错误区分

错误应清晰区分：

- 未携带 token
- token 格式错误/无效
- token 有效但上游无权限或额度不足
- 上游服务异常

不得把不同错误混成同一类“认证失败”。

## 10. 安全设计

### 10.1 URL 安全边界

由于第一版多模态输入以 URL 为主，必须严格限制：

- 只允许 `http` / `https`
- 拒绝 `file:`、`data:`、`ftp:` 等协议
- 默认拒绝本地/内网地址，避免 SSRF

至少拦截：

- `localhost`
- `127.0.0.1`
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`

必要时也应防御解析后跳转到内网地址的情况。

### 10.2 超时与并发保护

每类上游调用都应设置超时：

- Web 检索/阅读
- 图片理解
- 音频理解
- 视频理解
- 图片生成

并限制：

- 单请求体大小
- 并发上限
- 上游连接池规模

### 10.3 日志脱敏

日志中不得记录完整 token。只记录：

- token 前缀/摘要
- 请求 ID
- tool 名称
- 耗时
- 成功/失败

### 10.4 Origin/CORS 最小化

该服务不是开放网页 API，应遵循最小开放原则：

- 不做宽松跨域开放
- 仅按 MCP 客户端需要保留最小兼容配置

## 11. 部署设计

### 11.1 部署形态

推荐采用：

- 独立服务
- docker compose 新增一个服务
- nginx 按子路径 `/mcp` 转发

理由：

- 与当前 `new-api` 的 Docker 路线一致
- 重建、升级、回滚方式统一
- 独立容器可实现故障隔离

### 11.2 端口布局

建议：

- `new-api`：继续现有端口映射
- `mimo-unified-mcp`：监听本地独立端口，例如 `127.0.0.1:8765`
- nginx：对外暴露 `https://matrix.000328.xyz:2053/mcp`

### 11.3 nginx 路由要求

新增 `/mcp` 反代规则时需要满足：

- 保留 `Authorization` 请求头
- 关闭代理缓冲
- 适当放宽读超时
- 设置合理请求体上限
- 保证现有 `/` 到 `new-api` 的流量不受影响

### 11.4 健康检查

容器或进程应提供：

- `/health`

并在部署里接入 healthcheck，确保重启和排障更简单。

## 12. 客户端安装交付

### 12.1 总体原则

同一个服务端入口，对外提供按客户端分类的安装材料，不要求用户分别安装多个 MCP 服务。

### 12.2 Claude Code

交付内容：

- `clients/claude-code/README.md`
- `clients/claude-code/mcp.example.json`
- `clients/claude-code/install.sh`

内容要求：

- 使用 HTTP MCP
- 指向 `https://matrix.000328.xyz:2053/mcp`
- 使用 `Authorization: Bearer <token>`
- 提供安装、检查、移除说明

### 12.3 Codex 类客户端

交付内容：

- `clients/codex/README.md`
- `clients/codex/mcp.example.json`
- `clients/codex/install.sh` 或 `generate-config.sh`

内容要求：

- 提供通用 HTTP MCP 配置模板
- 明确 Bearer token 的配置方式
- 如 Codex 的 MCP 配置格式与 Claude Code 不同，则单独维护一份模板，不在服务端做额外分路径兼容层

### 12.4 token 约定

所有客户端统一约定：

- `Authorization: Bearer <token>`

不为不同客户端引入不同 header 风格。

## 13. 验证与验收

### 13.1 协议级验证

必须验证：

- `initialize` 正常
- `tools/list` 正常
- `tools/call` 正常
- 错误格式统一
- 未认证请求明确失败

### 13.2 工具级验证

7 个工具均需覆盖：

- 成功路径
- 参数缺失/非法路径
- 上游超时/异常路径

对多模态 URL 工具额外验证：

- 正常公网 URL 可成功
- 非法协议被拒绝
- 本地/内网地址被拒绝

### 13.3 认证验证

至少验证：

1. 不带 token
2. token 无效
3. token 有效
4. token 有效但上游权限/额度不足

### 13.4 部署验证

至少验证：

- 本地监听端口正常
- nginx `/mcp` 反代正常
- `/health` 正常
- `new-api` 原有路由不受影响
- 服务重启后恢复正常

### 13.5 客户端验证

Claude Code：

- 安装配置成功
- 能在 `/mcp` 中看到工具
- 至少成功调用一次 Web 工具
- 至少成功调用一次多模态理解工具
- 至少成功调用一次图片生成工具

Codex：

- 配置可加载
- 能连接到 HTTP MCP
- 能列出工具
- 至少成功完成一次工具调用

### 13.6 第一版验收标准

满足以下条件即可视为第一版完成：

- 单一 HTTP MCP 入口可用
- Claude Code 可安装并调用全部工具
- Codex 可安装并完成基础调用
- 7 个工具都通过核心路径验证
- Bearer token 认证生效
- nginx 路由与 `new-api` 主服务互不干扰

## 14. 后续实施边界

本设计对应一个可执行的单项目实现计划，范围适合继续进入 implementation planning。

实施阶段重点将是：

1. 建立统一 Node/TypeScript HTTP MCP 服务框架
2. 迁移/复用现有 Web MCP 逻辑
3. 迁移/复用图像生成逻辑
4. 新增 MiMo 图片/音频/视频理解工具
5. 加入 Bearer token 校验与安全边界
6. 编写 docker/nginx/client 安装产物
7. 完成协议、部署、客户端三层验证
