---
name: NOME
description: 以深色个人星图组织六个领域的本地档案阅读界面。
colors:
  paper: "#071314"
  surface: "#0d1d1e"
  ink: "#edf5ed"
  muted: "#a3bab3"
  accent: "#b9f4ce"
  line: "#29413e"
  pending: "#efd09b"
  draft: "#cbbde7"
typography:
  display:
    fontFamily: "NOME Display, PingFang SC, sans-serif"
    fontSize: "clamp(24px, 4vw, 46px)"
    fontWeight: 500
    letterSpacing: "-.03em"
  headline:
    fontFamily: "NOME Display, PingFang SC, sans-serif"
    fontSize: "clamp(30px, 3.5vw, 48px)"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-.025em"
  body:
    fontFamily: "PingFang SC, Microsoft YaHei, -apple-system, sans-serif"
    fontSize: "19px"
    lineHeight: 1.9
  label:
    fontFamily: "PingFang SC, Microsoft YaHei, -apple-system, sans-serif"
    fontSize: "clamp(14px, 1.4vw, 18px)"
    fontWeight: 400
    letterSpacing: ".12em"
  metadata:
    fontFamily: "PingFang SC, Microsoft YaHei, -apple-system, sans-serif"
    fontSize: "13px"
  status:
    fontFamily: "PingFang SC, Microsoft YaHei, -apple-system, sans-serif"
    fontSize: "12px"
rounded:
  circle: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "44px"
  xxl: "64px"
components:
  text-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "8px 0"
  text-button-hover:
    textColor: "{colors.accent}"
  atlas-node:
    backgroundColor: "transparent"
    rounded: "{rounded.circle}"
    padding: "12px"
    width: "84px"
  domain-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "10px 0"
  domain-tab-current:
    textColor: "{colors.accent}"
  reading:
    backgroundColor: "{colors.surface}"
    padding: "44px clamp(28px, 4vw, 64px)"
    height: "100svh"
---

# Design System: NOME

## Overview

**Creative North Star: "个人星图"**

深墨绿空间里，六个领域围绕同一个人展开。倾斜轨道、有明暗层次的主星球和六颗卫星形成识别语言；星图承担领域选择，不表达人格评分或完成度。

阅读界面延续同一暗色空间，以温白正文、细分隔线和留白承载个人记录。界面只读；确认、待核实、草稿和主动留白有各自明确的文字表达。原生 SVG、Canvas 球面投影、本地太阳系贴图与本地字体构成视觉材料，运行时不依赖外部资源。

**Key Characteristics:**

- 深墨绿底色与薄荷色光感。
- 中心太阳、六颗各具材质的行星和一条共享的倾斜公转轨道。
- 阅读内容用分栏与横线组织，状态同时用文字说明。
- 不同速度的公转、小幅视差和节点镜头推进；支持暂停和减少动态效果。

## Colors

主色清冷、明亮，正文温和；暖沙色与浅紫色只承担档案状态的区别。

### Primary

- **薄荷光 · accent**：当前领域、键盘焦点、已确认状态与交互反馈。

### Secondary

- **暖沙 · pending**：待核实记录及虚构示例提示。
- **浅紫 · draft**：草稿记录与对应领域节点。

### Neutral

- **深墨绿 · paper**：全局背景与主动留白节点的内部。
- **阅读墨绿 · surface**：阅读面板，与星图背景形成轻微层次。
- **温白 · ink**：正文与主要信息。
- **灰绿 · muted**：描述、来源、时间与未选中的文本控件。
- **暗绿线 · line**：阅读区域边界、记录之间与导航上方的细线。

**The Explicit State Rule.** 颜色辅助区分状态，阅读视图必须保留“已确认”“待核实”“草稿”等文字。

## Typography

**Display Font:** NOME Display，本地 Noto Sans SC Medium 字体子集；回退为 PingFang SC、sans-serif。

**Body Font:** PingFang SC、Microsoft YaHei、-apple-system、sans-serif。

展示字体用于中心标识与固定领域标题，正文保留适合用户自由输入内容的中文系统字体。字重克制，长文依靠行高与留白建立阅读节奏。

### Hierarchy

- **Display**：星图中心名称；桌面阅读模式改用 `clamp(24px, 3vw, 40px)`，手机为 `30px`。
- **Headline**：领域标题；较紧的字距与平衡换行。
- **Body**：记录正文，行宽最多 `70ch`，保留原始换行并允许长内容折行；手机字号为 `18px`。
- **Label**：节点显示六类全名，`clamp(12px, 1.1vw, 15px)`；手机为 `12px`。
- **Metadata / Status**：来源、时间和记录状态；状态文字放在对应正文之前。
- 空状态主句为 `24px / 1.7`，对话引导为 `14px / 1.9`。

**The Local Display Rule.** 展示字库是固定标题子集，新增展示文案前须核对字形覆盖；用户正文继续使用完整的中文文本字体栈。

## Layout

星图按 `600 / 560` 比例居中。桌面默认宽度为 `min(86vw, 92svh, 930px)`，舞台至少占满一个视口。首页只显示星图、领域全名标签和中心名称；这是当前首页的约束，不能外推为其他页面禁用说明文字。

进入领域后，原星图保持挂载，镜头连续缩放、平移到选中的行星。行星停在视口横向 25.5%、纵向 50% 的位置，右侧 48% 为独立滚动的阅读内容。行星可见宽度最多 520px。工具栏与正文之间保留大间距，连续记录用上边距 `32px`、上内边距 `28px` 和细线分开。

宽度不超过 `760px` 时，星图宽度改为 `min(96vw, 94svh)`；进入领域后行星停在上方 40svh 区域，内容在下方 60svh 独立滚动，水平内边距为 `24px`。底部领域导航为三列两行，列间距 `16px`。宽度至少 `761px` 且高度不超过 `480px` 时，星图缩为 `min(70vw, 90svh)`，节点间隙收紧。

来源详情采用 `72px / minmax(0, 1fr)` 两列；长参考内容允许换行，不撑开面板。

## Elevation & Depth

深度来自星球的定向光照、暗面、半透明轨道与卫星的远近缩放。阅读面板使用色差和一像素细线，没有卡片投影。发光是星体材质和交互反馈的一部分。

### Shadow Vocabulary

中心太阳发光，行星明暗朝向太阳；球面投影压缩边缘地貌，地球保留云层与大气，土星保留球体，移除外部星环。按三维深度排序，背后的行星被太阳遮挡。键盘焦点临时提升层级以保持可见。

**The Orbital Light Rule.** 光晕服务于星图节点与球体；记录阅读依靠色层、间距和分隔线建立结构。

## Shapes

球体与投影轨道构成星图。六颗行星的设计直径统一为 44 单位，太阳为 152 单位，随 600×560 舞台缩放。命中区域至少 70×78px，不随轨道远近缩放；尺寸仅表达行星身份，不表达资料数量或评分。

内容面板保持直边；记录之间使用横线，不套用圆角卡片。按钮为透明文本或圆形节点，图标使用描边 SVG。

## Components

### Buttons

返回与重试按钮是轻量文本操作，最小高度 `44px`，字为灰绿，悬停变为薄荷色。返回箭头为 `20px` 描边 SVG。通用键盘焦点使用 `2px` 薄荷色轮廓、外偏移 `6px`。

### Navigation

领域导航使用六类全名。桌面可换行排列，列间距 `22px`、行间距 `8px`；手机使用三列网格。当前领域以薄荷色和下划线双重标识，下划线偏移 `8px`；每项至少 `44px × 44px`。导航位于阅读内容之后。

### Records and Source Disclosure

记录直接铺在阅读面板上，依次为状态、正文和原生 `details / summary` 来源折叠。已确认、待核实和草稿分别使用语义色；主动留白、不适用和无记录有不同的空状态文案。来源折叠摘要最小高度 `44px`，展开后以细线和两列字段显示出处及时间。

### Star Atlas

太阳与六颗行星使用 Solar System Scope 的 CC BY 4.0 本地材质，投影为球面。水星陨石坑、金星云层、地球大陆与云层、火星地貌、木星云带、土星色带形成不同身份；状态由阅读页文字解释，不改变行星纹理。

六颗行星共享半径 `220`、倾角 `67°`、画面旋角 `-18°` 的轨道，统一周期为 `120s`，沿轨道固定相隔 `60°`。轨道与行星位置共用三维投影，球体直径不随类别或轨道远近改变，深度排序让太阳遮挡背面的行星。标签始终正向并独立于球体深度，轨道上方的标签放在球体上方，避免被太阳遮住；使用身份与处境、动机与价值、特质与偏好、能力与经验、关系与连接、经历与变化六类全名。鼠标悬停或键盘聚焦时暂停便于选择。鼠标悬浮只放大球体 18%，180ms 过渡，不新增外圈；移出恢复。中心悬浮名称使用 14–24px 字号容纳全名。详情标题下展示该类定义，状态与来源分开呈现。待分类旧资料在详情独立折叠，不归到任一新类别。

鼠标视差最多平移 `8px`、倾斜 `2–3°`，采用 `.6s` 平滑跟随；触屏不启用视差。点击节点按轨道实时坐标在 `950ms` 内推进至行星近景，内容延迟 `.25s` 进入；返回在 `750ms` 内拉远到原星系。缩放倍率按行星直径与视口计算，镜头缓动使用 `cubic-bezier(.22, 1, .36, 1)`。球体保留同一 Canvas 与同一位置数据，近景纹理分辨率为 768px。

中心字标内置暂停/继续按钮。阅读、离屏和后台自动停止循环；用户暂停同时关闭视差与推进。系统开启减少动态效果时，取消自转、视差和空间过渡，保留选中状态与直接导航。后退与 Escape 从当前镜头帧反向移动；视口、后台与偏好变化直接收敛到正确构图。进入完成后焦点落到内容标题，返回后恢复对应行星焦点。近景星图为 inert 装饰，领域切换使用阅读区按钮。

## Do's and Don'ts

### Do:

- **Do** 保留六颗行星的不同材质，用阅读页文字与状态色表达记录性质。
- **Do** 保持主星球和卫星的光照方向与轨道关系，阅读内容使用清晰的正文和分隔线。
- **Do** 为所有可操作元素保留键盘焦点与足够的命中区域，并尊重减少动态效果设置。
- **Do** 从本地提供字体和图形资源，扩展展示文案时检查字体子集。

### Don't:

- **Don't** 把节点大小、轨道或亮度解释为人格评分、完成度或能力排名。
- **Don't** 在当前首页恢复顶部导航、描述、内容卡片、英文标语或底部引导区。
- **Don't** 只靠颜色区分已确认、待核实、草稿和主动留白。
- **Don't** 把虚构示例资料当成用户真实档案展示。
