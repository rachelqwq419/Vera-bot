# 🎨 动态 CG 图鉴与掉落系统 — 实作报告

> **项目**：vera-bot（薇拉 AI）  
> **日期**：2026-05-23  
> **版本**：Phase 3

---

## 一、修改摘要

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/constants.ts` | 新增 | 添加 `CG_CATEGORIES` 对照表（27 个分类） |
| `src/types.ts` | 新增栏位 | `UserRecord` 增加 `unlocked_cgs: string` |
| `schema.sql` | 新增表 | 建立 `cgs` 表（id/category/file_id） |
| `src/handlers.ts` | 多处修改 | PM middleware 放行、`/addcg`、`/deletecg`、`/cg`、callback_query |
| `src/deepseek.ts` | 多处修改 | CG 掉落判定逻辑、batch UPDATE 扩展 |
| `CG_SYSTEM_REPORT.md` | 新建 | 本报告文件 |

---

## 二、数据库变更（需手动执行）

### 2.1 建立 `cgs` 表

```sql
CREATE TABLE IF NOT EXISTS cgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    file_id TEXT NOT NULL
);
```

> 此语句已写入 `schema.sql`，新部署会自动执行。若为现存数据库，请在 D1 Console 手动执行。

### 2.2 新增 `users.unlocked_cgs` 栏位

```sql
ALTER TABLE users ADD COLUMN unlocked_cgs TEXT DEFAULT '[]';
```

> 请在 D1 Console 手动执行此行，因为 `schema.sql` 只包含 `CREATE TABLE IF NOT EXISTS`，不处理已有表的 ALTER。

---

## 三、各文件修改详情

### 3.1 `src/constants.ts` — 新增 CG 分类对照表

新增 `CG_CATEGORIES` 常量，将系统内部标签（如 `kiss`、`creampie`、`cowgirl`）映射为用户可见的中文名称（如 `💋 亲吻`、`💦 内射`、`🐮 骑乘位`）。

支持 27 个分类，与 `deepseek.ts` 中 `s` 对象的 key 一一对应。

```typescript
export const CG_CATEGORIES: Record<string, string> = {
  kiss:            '💋 親吻',
  creampie:        '💦 內射',
  paizuri:         '🍼 乳交',
  // ... 共 27 项
};
```

### 3.2 `src/types.ts` — 新增栏位

`UserRecord` 接口增加：

```typescript
unlocked_cgs: string;  // JSON 数组，储存已解锁的 CG ID
```

### 3.3 `src/handlers.ts` — 四处修改

#### A. PM 全域拦截器（第 9-21 行）

**原逻辑**：非管理员的私讯一律拦截。

**新逻辑**：额外放行两种请求：
- `callback_query`（InlineKeyboard 按钮点击）
- 讯息文字以 `/cg` 开头

```typescript
if (ctx.callbackQuery) return next();
const msgText = ctx.message?.text || ctx.message?.caption || '';
if (msgText.startsWith('/cg')) return next();
```

#### B. `/addcg` — 管理员加图（第 537-559 行）

**触发方式**：管理员在私讯发送图片，caption 输入 `/addcg <分类名称>`

**流程**：
1. 验证是否为 `ADMIN_USER_ID`
2. 提取最高画质 photo（`photos[photos.length - 1]`）
3. 将 `file_id` + `category` 写入 `cgs` 表
4. 回复成功讯息

**示例**：
```
/cg add cum_face   ← 写在图片 caption
```

#### C. `/deletecg` — 管理员删图（第 561-603 行）

**两种用法**：
- `/deletecg`（无参数）：列出所有 CG 及其 ID，按分类分组
- `/deletecg <id>`：删除指定 ID 的 CG

#### D. `/cg` — 用户图鉴（第 605-680 行）

**限制**：仅限私讯。群组内使用会提示用户私讯。

**流程**：
1. 查询用户 `unlocked_cgs`
2. 扫描 `cgs` 表，按分类统计总数
3. 构建 InlineKeyboard，每行 2 个按钮
4. 每个按钮显示 `分类名 (已解锁/总数)`

#### E. `callback_query` 处理器（第 682-718 行）

**触发**：用户点击图鉴分类按钮（`callback_data` 格式为 `cg:<category>`）

**流程**：
1. 验证 callback 前缀为 `cg:`
2. 解析用户已解锁列表
3. 查询该分类下所有 CG，筛选已解锁
4. 若无解锁：弹出 alert 提示
5. 若有解锁：使用 `replyWithMediaGroup` 批量发送（每批最多 10 张）

#### F. `/resetuser` 更新（第 319 行）

新增 `unlocked_cgs = '[]'` 到重置 SQL 中，确保用户数据清零时一并清除 CG 进度。

### 3.4 `src/deepseek.ts` — 三处修改

#### A. 导入 `CG_CATEGORIES`（第 2 行）

```typescript
import { ..., CG_CATEGORIES, type Mood } from "./constants";
```

#### B. CG 掉落判定（第 368-401 行）

插入在成就广播之后、batch write 之前。逻辑：

1. **收集触发类别**：遍历 `s` 对象，找出本次 `count > 0` 的动作（排除 `sex` 通用标签）
2. **查询匹配 CG**：`SELECT id, category FROM cgs WHERE category IN (...)`
3. **过滤未拥有**：比对用户 `unlocked_cgs`，保留 `!unlockedSet.has(cg.id)` 的 CG
4. **随机抽取 1 张**：`Math.floor(Math.random() * unownedCgs.length)`
5. **更新**：将新 ID 加入 `unlockedList`，序列化为 `newUnlockedCgs`
6. **追加提示**：在 `finalReplyToUser` 末尾加上解锁提示

```typescript
finalReplyToUser += `\n\n🎉 系統提示：恭喜解鎖隱藏 CG【${displayName}】！請私訊薇拉輸入 /cg 領取及查看專屬圖鑑。`;
```

#### C. batch UPDATE 扩展（第 415、428 行）

SQL 增加 `unlocked_cgs = ?`，bind 链增加 `newUnlockedCgs`。

---

## 四、管理员使用指南

### 4.1 添加 CG 图片

1. **私讯**机器人
2. 发送**一张图片**，在 caption（图片说明）中输入：
   ```
   /addcg <分类名称>
   ```
3. 例如：`/addcg cum_face`
4. 机器人回复：`✅ 成功將圖片加入【🎯 顏射】分類！`

**可用分类名称**（共 27 个）：
```
kiss, creampie, paizuri, blowjob, swallow, handjob, footjob, anal,
cum_face, cum_tits, orgasm, public, hair_pull, apron, submissive,
cowgirl, reverse_cowgirl, doggy, missionary, standing, against_wall,
sixty_nine, deepthroat, shower, school_uniform, pantyhose, blindfold
```

> ⚠️ 建议每个分类至少准备 3-5 张不同图片，增加「必定掉落新图」的覆盖概率。

### 4.2 查看 CG 列表

在任意聊天输入：
```
/deletecg
```
机器人会列出所有 CG，按分类分组，显示每个 CG 的 ID。

### 4.3 删除 CG

```
/deletecg <id>
```
例如：`/deletecg 5`

---

## 五、用户使用指南

### 5.1 CG 掉落机制

每次与莎萝的互动中，若触发了以下任一**性行为标签**，系统会自动判定 CG 掉落：

| 触发事件 | 对应分类 | 触发条件 |
|---------|---------|---------|
| 接吻 | `kiss` | AI 输出 `[SEX: kiss]` |
| 内射 | `creampie` | AI 输出 `[SEX: creampie]` |
| 口交 | `blowjob` | AI 输出 `[SEX: blowjob]` |
| 颜射 | `cum_face` | AI 输出 `[SEX: cum_face]` |
| ... | ... | 所有 27 个分类 |

**掉落规则**：
- 每次互动最多掉落 **1 张** CG
- 只会掉落用户**尚未解锁**的 CG
- 从匹配分类中**随机抽取**
- 掉落时消息末尾会显示系统提示

**不会**在群组直接发送图片，仅追加一行文字提示：
> 🎉 系統提示：恭喜解鎖隱藏 CG【💋 親吻】！請私訊薇拉輸入 /cg 領取及查看專屬圖鑑。

### 5.2 查看图鉴

1. **私讯**机器人
2. 输入 `/cg`
3. 机器人显示分类菜单：

```
📸 【薇拉的私密圖鑑】

請選擇要查看的分類：

[💋 親吻 (2/5)]  [💦 內射 (1/10)]
[🍼 乳交 (0/3)]  [👄 口交 (3/8)]
...
```

4. 点击任一分类按钮，机器人会发送该分类下**所有已解锁**的 CG 图片

### 5.3 注意事项

- `/cg` 指令**仅限私讯**使用（群组内会提示私讯）
- 图鉴内容属于私密数据，不同用户的解锁进度互不影响
- 被管理员删除的 CG 仍会保留在用户的 `unlocked_cgs` 中，但图鉴按钮不会再显示该 CG（因为数据库记录已删除）

---

## 六、部署清单

### 6.1 数据库迁移（手动执行）

在 Cloudflare Dashboard → D1 → 选择 `vera_db` → Console 中执行：

```sql
-- 1. 建立 cgs 表
CREATE TABLE IF NOT EXISTS cgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    file_id TEXT NOT NULL
);

-- 2. 新增 unlocked_cgs 栏位
ALTER TABLE users ADD COLUMN unlocked_cgs TEXT DEFAULT '[]';
```

### 6.2 部署 Worker

```bash
npx wrangler deploy
```

### 6.3 验证

1. 管理员私讯机器人，发送带 `/addcg kiss` caption 的图片 → 应收到成功回复
2. 用户与莎萝互动触发 `[SEX: kiss]` → 消息末尾应出现 CG 掉落提示
3. 用户私讯输入 `/cg` → 应显示图鉴菜单
4. 点击分类按钮 → 应发送已解锁的图片

---

## 七、技术备注

- **inline SQL**：CG 掉落查询使用 `category IN (?, ?, ...)` 动态占位符，符合 D1 参数化查询安全规范
- **JSON 存储**：`unlocked_cgs` 使用 JSON 数组格式 `[1, 3, 7]`，与现有 `achievements`、`gifts_received` 栏位风格一致
- **无需额外索引**：`cgs` 表数据量预期较小（数百条），`category` 字段的 `IN` 查询足够高效
- **相容性**：所有修改向下兼容，旧用户 `unlocked_cgs` 字段默认为 `'[]'`
