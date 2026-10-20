# CLI 与档案协议 v2

所有命令由当前宿主的 shell 执行，无外部 API 或 npm 依赖。以下以 `nome` 简写；直接安装的 Skill 使用 `node <skill根目录>/scripts/nome.mjs`。

## 只读命令

```sh
nome doctor
nome read --domain motivation
nome read --drafts
nome history
nome sources --agent codex
nome sources --agent claude --memory-dir /explicit/current/project/memory --content
nome sources --agent codex --path /explicit/memory.md --content
nome serve --open
```

`--data-dir DIR` 优先于 `NOME_DATA_DIR`，最后才是用户目录下 `.nome`。目录缺失时，读取返回空档案，不自动创建文件。`read --drafts` 包含用户明确保存的草稿；`--include-inactive` 仅在用户要求查看／管理跳过领域时使用。sources 默认列出元数据，--content 才读正文。不要在隐式咨询中调用 sources。

领域：`identity` 身份与处境，`motivation` 动机与价值，`traits` 特质与偏好，`capabilities` 能力与经验，`relationships` 关系与连接，`growth` 经历与变化。含义与分类规则见 [domains.md](domains.md)。

状态：`confirmed` 已由用户确认；`imported` 导入或保存但尚未核实；`inferred` 待确认推测。source 与状态相互独立，核实一条旧记忆后仍保留它原先的来源。

## 修改：apply

```sh
nome apply --file /private/path/change.json
# 或由支持安全 stdin 的工具传入 JSON：
nome apply --file -
```

用户说“帮我更新个人档案：我每周可以拿出 4 小时学习”时，读取 revision 后提交：

```json
{
  "baseRevision": 0,
  "authorization": { "userRequested": true, "intent": "update", "confirmed": true },
  "operations": [
    {
      "type": "upsert",
      "record": {
        "id": "weekly-learning-time",
        "domain": "identity",
        "content": "每周可以拿出 4 小时学习。",
        "source": { "type": "user", "reference": "本次用户明确更新" },
        "status": "confirmed"
      }
    }
  ]
}
```

`baseRevision` 必须来自刚读取的档案。授权字段由 Agent 如实转述人类请求，并不能证明用户身份，也不是安全沙箱。程序拒绝缺少授权、未知字段和未确认的 confirmed 记录；Agent 不能为了通过校验伪造这些字段。

- `authorization.intent`：initialize / update / save-interview / save-progress。initialize 和 save-interview 保存正式记录或领域状态必须有 confirmed=true，表示用户认可这次保存的草稿；记录本身仍可为 imported，不代表用户已核实每条旧记忆。
- `upsert.record`：id 可省略，由程序生成；更新已有记录时必须提供已有 ID。domain、content、source、status 必填。程序填 createdAt、updatedAt、confirmedAt，调用者不要提供时间字段。
- source.type：user / codex-memory / claude-memory / document / inference；可选 reference 为简短来源标识，不复制完整原文。content 上限 6000 字符，reference 上限 1000；一次最多 100 个操作。
- 保存问答进度：intent=save-progress、upsert.target=drafts，记录 status 必须 imported 或 inferred。正式确认时复用草稿 ID、target=records，草稿自动移出。草稿不会进入默认 read。
- 保存导入的旧记忆：source.type 对应宿主，status=imported；只有明确核实仍成立才标 confirmed。精确重复按 domain+content+source 去重；语义冲突由 Agent 澄清。未确认记录不能覆盖已确认记录；完全相同的重复导入直接忽略。
- 领域状态操作：`{"type":"domain","domain":"motivation","state":"withheld"}`。state 可为 active / withheld / not_applicable。主动跳过不算信息缺失，不自动删除旧记录；重新启用需用户要求。
- `apply` 返回 changed、revision 和受影响 ids。整批操作先在内存验证，再原子写入，任何一项失败不部分提交。没有实际变化不增加版本号。

## 撤销与彻底删除

undo 输入：

```json
{ "baseRevision": 1, "authorization": { "userRequested": true, "intent": "undo" } }
```

forget 输入：

```json
{ "baseRevision": 1, "authorization": { "userRequested": true, "intent": "forget" }, "ids": ["weekly-learning-time"] }
```

分别传给 `nome undo --file …` 和 `nome forget --file …`。forget 会清除全部历史快照中的目标 ID，之后 undo 不能恢复它；历史事件只保留不含正文的操作类型和时间。手动复制的其他 ID、外部备份、宿主记忆与聊天不在删除范围。

## 安装与服务

```sh
nome install --agent both
nome upgrade --agent both
nome uninstall --agent both
nome serve --open --port 43821
nome serve --demo --open
```

安装器只管理带 NOME 标记的目录；`--home DIR` 可用于隔离安装验证，不改变真实用户目录。安装／升级／卸载不会创建或修改个人档案。不要将 --home 当作数据目录选项；数据位置始终由 --data-dir / NOME_DATA_DIR 决定。

页面只监听 127.0.0.1，端口冲突时选择系统可用端口，以 stdout 的实际 URL 为准。GET /health 返回服务状态；GET /api/profile 返回六个领域、记录与草稿；不提供写入 HTTP 接口。浏览器打开失败时返回地址供手动访问。Ctrl+C 停止服务。演示模式仅使用打包的虚构资料，不读取本地个人档案。

## 故障处理

`INVALID_INPUT / INVALID_JSON`：修正载荷，不猜测用户意思。`CONFIRMATION_REQUIRED / AUTHORIZATION_REQUIRED`：缺乏真实授权时先回到对话，不修改标志绕过。`REVISION_CONFLICT / RECORD_CONFLICT`：重新读取并与用户当前请求核对。`CORRUPT_STORE / UNSUPPORTED_SCHEMA`：保留原文件，报告问题，不自动重建。`WRITE_LOCKED`：可能正在写入或之前进程中断；先检查活跃进程，确认失效后由用户决定清除锁。

档案存在单个 store.json 中，包含 schemaVersion=2、revision、updatedAt、profile 与 history。profile 包含 domains、records、drafts；history 包含每次修改前后的结构化快照。为避免重新泄漏已删除内容，不保存自由文本修改理由、原始授权语句或独立日志。读取时校验版本；不自动迁移未知版本。

## v1 兼容与待分类

读取已知 v1 档案时只在内存转换，不改写磁盘、不改变 revision、确认状态、原文、来源或时间。context → identity，goals / values → motivation，preferences → traits；experience / constraints 的含义横跨新类别，统一保留为 unclassified 待用户确认，不能从旧分类名推断新归属。当前档案与所有历史快照一起转换，撤销不会恢复旧分类结构。

每条旧记录保留 legacyDomain，每份旧快照保留 legacyDomains 的原状态与时间，可据此恢复原分类结构。合并领域时任一旧领域 withheld 则合并领域 withheld；否则任一 not_applicable 则合并领域 not_applicable，避免因合并暴露原本隐藏的资料。只有用户明确重新启用该合并领域，才恢复其内容。未分类旧资料继续遵循原领域的隐藏状态。

`read --domain unclassified --drafts` 单独查看待分类资料；`--include-inactive` 仍只用于用户明确要求管理隐藏资料。它不增加第七颗行星，也不计入六类覆盖、不用于建议。页面在任一详情的“待分类的旧资料”中保留可见旧资料的原文和来源，默认折叠。新信息也可用 upsert 写入 domain=unclassified；未明确归属时不猜测。确认分类后复用原 ID、正文、来源和状态，用新 domain upsert。该明确更新后，当前记录不再携带 legacyDomain；历史仍保留变更前的原分类，forget 仍清除所有快照中的该记录。

首次真正的 apply / undo / forget 才原子写入 v2；无实际变化的请求不触碰原文件。未知版本或格式错误仍拒绝并保留原文件。NOME 不另存包含正文的迁移副本，以免破坏彻底删除语义。
