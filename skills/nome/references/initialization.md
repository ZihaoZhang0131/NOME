# 初始化

先检查已有档案，保留已有正文。初始化由当前 Agent 根据用户明确请求完成，安装器不读取个人资料。

## 先利用已有记忆

优先利用当前上下文中已注入的个人记忆、宿主公开的记忆工具，再运行 `sources --agent codex|claude --content` 检查受支持的本地来源。项目操作规则不能直接当作个人偏好。

Codex 检查 CODEX_HOME（否则 ~/.codex）下 memories/memory_summary.md、memories/MEMORY.md 和已适配的 memories_1.sqlite。SQLite 适配只读 stage1_outputs 中有限数量的 raw_memory；未支持的结构返回 unsupported，不遍历任意表或原始聊天。Node 未提供 SQLite 时仍可读取文本来源。

Claude 检查用户级与当前项目的 CLAUDE.md；当前项目的 auto memory 目录由宿主或用户明确提供 --memory-dir，不猜测其他项目路径。用户指定文件用 --path；网页摘要使用宿主可用的浏览器工具读取，不要求用户重复复制或填写。

来源区分 available、empty、missing、unreadable、unsupported、too_large、not_text 和 not_file。文本单文件最多 64 KiB，总计最多 256 KiB；SQLite 适配最多选取最近 16 份摘要，超限明确返回 truncated。来源有文件但为空，不等于用户没有相关经历；默认入口不存在，也不能宣称所有记忆都不存在。

## 没有可读来源

简短说明实际结果并给出选择：“本地暂时没有找到可读取的记忆。你想指定其他来源，还是直接和我一起补充？”

可以指定文件、文档、ChatGPT 网页版记忆管理中的摘要，或直接进入全面梳理。不要自行扩大到所有聊天、其他项目和全部用户目录。登录或权限受阻时说明具体障碍，提供用户可完成的下一步。

## 整理与保存

按 [domains.md](domains.md) 合并成完整的模块正文，去除同义重复，保留有意义的细节。排除密钥、身份号码和无关第三人资料。有冲突的在当前对话核对；未解决内容不入库。

来源和操作时间只用于当前读取判断，不写入档案。用户接受的导入内容就是正式 Markdown，不新增待核实或推测状态。人生时间正常保留。

用户只要求泛化初始化时，可展示精简模块概览后确定保存范围。用户已经说“按这份内容保存”或“用这份记忆初始化”，范围明确时直接保存，不重复确认。通过 [protocol.md](protocol.md) 提交并重新读取，随后说明已建立哪些模块。若用户希望继续，按 [interview.md](interview.md) 先补整体脉络。
