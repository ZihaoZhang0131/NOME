# Markdown 档案协议

档案唯一正文位于数据目录 profile/domain/filename.md。默认数据目录 ~/.nome；--data-dir 优先于 NOME_DATA_DIR。读取不创建文件，页面无 HTTP 写入接口，无外部 API、数据库或 npm 运行依赖。

## 读取与写入

```sh
node <skill目录>/scripts/nome.mjs read
node <skill目录>/scripts/nome.mjs read --domain growth
node <skill目录>/scripts/nome.mjs apply --file /private/change.json
# 也可使用安全 stdin：apply --file -
```

read 返回 hash 和六个 domains，每个领域有 id、name、documents；文档只有 path 和 markdown。hash 是本次读取的全档案并发校验值，不持久化，不在页面展示。

修改 JSON 示例（baseHash 必须替换为刚读取的 hash）：

```json
{
  "baseHash": "读取结果中的64位hash",
  "authorization": { "userRequested": true, "intent": "update" },
  "operations": [
    { "type": "write", "path": "growth/index.md", "markdown": "# 经历与变化\n\n## 成长背景\n\n用户已明确要求保存的叙述。\n" }
  ]
}
```

intent 为 initialize、update、save-interview。授权字段如实反映用户请求，不是操作系统安全隔离。明确保存即执行，不要求额外 confirmed 字段。其他任何业务字段均不接受。

每个领域必须有 index.md；可添加语义清晰的章节文件，index.md 以相对链接组织顺序。文件名只允许小写字母、数字、下划线和连字符，目录必须为六领域之一，不支持更深目录或符号链接。单文件上限 1 MiB，全档案上限 4 MiB，一次最多 100 个操作；输入 JSON 上限 8 MiB。不使用 YAML frontmatter。

整文件删除：

```json
{ "type": "delete", "path": "growth/old-chapter.md" }
```

所有操作先验证，写入临时目录后切换整个档案目录。校验 hash、写锁和临时备份仅用于安全提交，成功后清理，不保留档案历史。没有实际变化不重写文件。

## 旧数据迁移

```sh
node <skill目录>/scripts/nome.mjs migrate
```

只读预览 v1/v2 store.json，返回 baseHash、legacyHash、按领域组织的 candidates 和排除项数量。候选仅含可见正式内容，排除旧草稿、未分类和不公开领域。不同旧状态不会成为新 Markdown 的标签。

Agent 在对话中整理候选、解决冲突并确定范围；用户接受的部分写成正式正文。提供与 apply 相同的 operations，authorization.intent=migrate，额外带预览的 legacyHash，通过 migrate --file 提交。没有内容也可用 write 写空 index.md，明确完成迁移。已有 profile 目录则拒绝重复迁移。

旧 store.json 原位保留作为回退副本，新档案读取完全忽略它。迁移不会改写历史或自动删除旧文件。用户决定是否另行清理。读取到仅有旧档案时返回 MIGRATION_REQUIRED，不声称空档案，不自动迁移。

## 本地服务

```sh
node <skill目录>/scripts/nome.mjs serve --open
node <skill目录>/scripts/nome.mjs serve --demo --open
```

只监听 127.0.0.1，默认端口 43821，占用后另选可用端口，以实际输出为准。/health 检查服务；/api/profile 返回六模块的 Markdown 正文与 demo 标记，不含 hash、状态、来源或操作时间。每次请求重新读取文件，刷新即可展示外部编辑。页面安全渲染标题、段落、列表、引用、表格、代码和链接；HTML 只当文本，不自动加载图片。内部文档链接与目录可以导航。

## 安装与诊断

```sh
node <skill目录>/scripts/nome.mjs install --agent codex
node <skill目录>/scripts/nome.mjs upgrade --agent both
node <skill目录>/scripts/nome.mjs uninstall --agent both
node <skill目录>/scripts/nome.mjs doctor
```

安装位置与以前一致，安装升级卸载不读写个人资料。doctor 检查环境、文件与锁，旧档案需迁移时明确报告。--home 仅用于隔离安装/来源/诊断，不替代 --data-dir。

- CONTENT_CONFLICT：重新读取并合并，不盲目替换 hash。
- WRITE_LOCKED：等待活跃写入；中断遗留锁时，用户明确要求恢复后运行 recover。它拒绝清理仍活跃的本机进程或无法识别的锁；可恢复目录交换中断时的原始文件。
- MIGRATION_REQUIRED：按上面的预览和选择流程迁移。
- CORRUPT_STORE / UNSUPPORTED_SCHEMA：旧档案损坏或格式不支持，保留原文件。
- UNSAFE_PATH / PROFILE_TOO_LARGE：检查文件结构或大小，不静默跳过正文。

暂停问答与未保存内容留在对话中，不提供 drafts、history 或 undo 的旧状态接口。
