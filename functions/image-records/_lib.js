const PREFIX = 'image_'
// 全量索引 key：保存所有记录的精简元数据（id/name/url/size/type/createdAt/width/height/deletedAt），
// 读列表 = 1 次 KV get（快路径直接信任索引），替代旧的逐 key 全表扫描（list + N 次 get）
const INDEX_KEY = 'image_records_index'
// 索引分片 key 前缀：单值超限时主键改存 { __sharded, shards } 标记，
// 分片本体在 image_records_index_shard_0..N-1；同样命中 image_ 前缀，全表扫描时必须排除
const INDEX_SHARD_PREFIX = 'image_records_index_shard_'
// 软删除记录保留 30 天，过期由读取时惰性清理
const SOFT_DELETE_TTL_MS = 30 * 24 * 60 * 60 * 1000

// 索引单值上限（KV 值大小限制约为 1MB~25MB 视平台而定，保守取 900KB 字符）
// 超限时自动切分为分片写入（读取端透明合并），不再退化为全表扫描
const INDEX_SAFE_LIMIT_BYTES = 900 * 1024

function json(code, msg, data, status = 200) {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
    },
  })
}

// 与 node-functions/api/_utils.ts 保持一致的密钥派生规则
function getAuthSecret(env) {
  return env?.AUTH_SECRET || ''
}

// base64url 解码为二进制字符串
function b64urlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return atob(padded)
}

// 校验 HMAC-SHA256 签名 token 的签名与有效期（与 Node 侧签发逻辑配套）
async function verifyAuthToken(token, env) {
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return false

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(getAuthSecret(env)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const mac = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)),
    )
    const sigBytes = Uint8Array.from(b64urlDecode(sig), (ch) => ch.charCodeAt(0))

    if (sigBytes.length !== mac.length) return false
    let diff = 0
    for (let i = 0; i < mac.length; i++) diff |= sigBytes[i] ^ mac[i]
    if (diff !== 0) return false

    const data = JSON.parse(b64urlDecode(payload))
    return typeof data.exp === 'number' && data.exp > Date.now()
  } catch {
    return false
  }
}

async function isAuthorized(request, env) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return false
  return verifyAuthToken(token, env)
}

// 简单的速率限制（内存版，多实例/边缘运行时下为尽力而为的防护，与 node-functions 侧同策略）
const rateLimitMap = new Map()

function getClientIp(request) {
  const eoIp = request.headers.get('eo-client-ip')
  if (eoIp && eoIp.trim()) return eoIp.trim()
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const ips = xff.split(',').map((s) => s.trim()).filter(Boolean)
    if (ips.length > 0) return ips[ips.length - 1]
  }
  return 'unknown'
}

// 命中限流返回 true；调用方按读写分桶计数。
// 本地内存为第一层快路径，IMG_RECORDS_KV 为跨实例共享计数层（固定窗口）；
// KV 未绑定或操作失败时自动降级为纯内存（尽力而为）。
// 注入式转义：非 [a-zA-Z0-9] 字符 → _x{十六进制}x，满足 KV 键仅允许数字/字母/下划线
// 的约束，且不同原始输入（如 IPv4 与 IPv6 片段）不碰撞
function sanitizeLimitKey(input) {
  return String(input).replace(/[^a-zA-Z0-9]/g, (ch) => `_x${ch.charCodeAt(0).toString(16)}x`)
}

function kvAvailable() {
  return typeof IMG_RECORDS_KV !== 'undefined' && IMG_RECORDS_KV && typeof IMG_RECORDS_KV.get === 'function'
}

async function isRateLimited(bucket, maxRequests, windowMs = 60000) {
  const now = Date.now()
  const windowId = Math.floor(now / windowMs)
  const memKey = `${windowId}:${bucket}`

  // 内存快路径：本实例已超限直接拒绝（内存计数只会比全局少，超限判定不会误放行）
  const mem = rateLimitMap.get(memKey)
  if (mem && now <= mem.resetTime && mem.count >= maxRequests) return true

  if (!kvAvailable()) {
    bumpMemory(memKey, windowMs, now)
    return false
  }

  const kvKey = `rl${sanitizeLimitKey(bucket)}${windowId}`
  try {
    const raw = await IMG_RECORDS_KV.get(kvKey)
    const count = Number(raw) || 0
    if (count >= maxRequests) {
      bumpMemory(memKey, windowMs, now)
      return true
    }
    await IMG_RECORDS_KV.put(kvKey, String(count + 1))
    bumpMemory(memKey, windowMs, now)
    // 新窗口首次写入时顺手清理上一窗口的 key，避免 KV 中 rl 前缀键无限累积
    if (count === 0) {
      Promise.resolve(IMG_RECORDS_KV.delete(`rl${sanitizeLimitKey(bucket)}${windowId - 1}`)).catch(() => {})
    }
    return false
  } catch {
    // KV 不可用：降级为纯内存限流（尽力而为）
    bumpMemory(memKey, windowMs, now)
    return false
  }
}

function bumpMemory(memKey, windowMs, now) {
  const rec = rateLimitMap.get(memKey)
  if (!rec || now > rec.resetTime) {
    rateLimitMap.set(memKey, { count: 1, resetTime: now + windowMs })
    if (rateLimitMap.size > 500) {
      for (const [key, r] of rateLimitMap) {
        if (now > r.resetTime) rateLimitMap.delete(key)
      }
    }
    return
  }
  rec.count++
}

function safeIdOf(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, '')
}

function recordKeyOf(safeId) {
  return `${PREFIX}${safeId}`
}

// ---------------------------------------------------------------- 索引层

// 读取索引；缺失/损坏时返回 null（由调用方决定是否回退扫描并重建）。
// 超限分片布局：主键为 { __sharded: true, shards: N } 标记，分片本体按序合并
async function readIndex() {
  try {
    const raw = await IMG_RECORDS_KV.get(INDEX_KEY, { type: 'json' })
    if (Array.isArray(raw)) return raw
    if (raw && typeof raw === 'object' && Number.isFinite(raw.shards) && raw.shards > 0) {
      const pages = await Promise.all(
        Array.from({ length: raw.shards }, (_, i) =>
          IMG_RECORDS_KV.get(`${INDEX_SHARD_PREFIX}${i}`, { type: 'json' }).catch(() => null),
        ),
      )
      // 任一分片读取失败必须整体回退全表扫描：返回部分合并结果会被调用方当作
      // 权威索引回写固化，缺失分片的记录将从列表永久消失（本体仍在）
      if (pages.some((p) => !Array.isArray(p))) return null
      const merged = []
      for (const page of pages) merged.push(...page)
      return merged
    }
    return null
  } catch {
    return null
  }
}

// 回退路径：逐 key 全表扫描并重建索引（仅在索引缺失/超限降级时触发）
// 回退路径：逐 key 全表扫描并重建索引（仅在索引缺失/超限降级时触发）
// 分页上限 200 页（256 键/页 ≈ 5.1 万条）：cursor 异常时兜底防死循环挂起请求
const LIST_MAX_PAGES = 200

async function listRecords() {
  const records = []
  let cursor = ''
  let complete = false

  while (!complete) {
    const page = await IMG_RECORDS_KV.list({ prefix: PREFIX, cursor, limit: 256 })
    const keys = Array.isArray(page?.keys) ? page.keys : []
    const values = await Promise.all(
      keys
        // 索引键与分片键同样命中 image_ 前缀，扫描时必须排除（否则会被当成记录混入列表）
        .filter(({ key }) => key !== INDEX_KEY && !key.startsWith(INDEX_SHARD_PREFIX))
        .map(({ key }) => IMG_RECORDS_KV.get(key, { type: 'json' })),
    )

    records.push(...values.filter(Boolean))
    complete = Boolean(page?.complete) || keys.length === 0 || records.length >= LIST_MAX_PAGES * 256
    cursor = page?.cursor || keys.at(-1)?.key || ''
  }

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

// 从全量记录重建索引（仅保留列表页所需字段；undefined 字段会被 JSON 序列化丢弃）
function buildIndex(records) {
  return records
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      thumbnailUrl: r.thumbnailUrl,
      size: r.size,
      type: r.type,
      createdAt: r.createdAt,
      width: r.width,
      height: r.height,
      deletedAt: r.deletedAt,
    }))
}

// 写入索引：
// - 总体积在安全上限内 → 单键写入（并清理缩容后遗留的分片键，防幽灵条目复活）
// - 超限 → 贪心按条切分为分片，主键写 { __sharded, shards } 标记
// 返回是否成功（失败时读取端回退全表扫描）
async function writeIndex(index) {
  try {
    // 探测写入前的分片布局，用于本次写入后清理多余分片
    let prevShards = 0
    try {
      const prev = await IMG_RECORDS_KV.get(INDEX_KEY, { type: 'json' })
      if (prev && !Array.isArray(prev) && Number.isFinite(prev.shards)) prevShards = prev.shards
    } catch {
      // ignore
    }

    const payload = JSON.stringify(index)
    if (payload.length <= INDEX_SAFE_LIMIT_BYTES) {
      await IMG_RECORDS_KV.put(INDEX_KEY, payload)
      for (let i = 0; i < prevShards; i++) {
        Promise.resolve(IMG_RECORDS_KV.delete(`${INDEX_SHARD_PREFIX}${i}`)).catch(() => {})
      }
      return true
    }

    // 贪心装箱：按单条序列化体积切分，每片不超过安全上限
    const shards = []
    let current = []
    let currentLen = 2 // '[]'
    for (const entry of index) {
      const entryLen = JSON.stringify(entry).length + 1
      if (current.length > 0 && currentLen + entryLen > INDEX_SAFE_LIMIT_BYTES) {
        shards.push(current)
        current = []
        currentLen = 2
      }
      current.push(entry)
      currentLen += entryLen
    }
    if (current.length > 0) shards.push(current)

    await Promise.all(
      shards.map((shard, i) => IMG_RECORDS_KV.put(`${INDEX_SHARD_PREFIX}${i}`, JSON.stringify(shard))),
    )
    await IMG_RECORDS_KV.put(INDEX_KEY, JSON.stringify({ __sharded: true, shards: shards.length }))
    for (let i = shards.length; i < prevShards; i++) {
      Promise.resolve(IMG_RECORDS_KV.delete(`${INDEX_SHARD_PREFIX}${i}`)).catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

// 保证拿到最新记录集，三档策略：
// - 快路径（默认）：直接信任索引（写路径已同步维护索引），1 次 KV 读出全量列表，
//   不再逐条读记录本体对账——旧实现对每条索引条目串行 get 本体，N 条记录 = N 次 KV 往返
// - verify=true：逐条对齐本体 deletedAt（旧行为，低频校验/修复，?verify=1 触发）
// - force=true：跳过索引强制全表扫描重建（?rebuild=1 恢复工具，历史被误清时自救）
// verify 的本体校验容忍读写延迟：60 秒宽限期内暂时读不到不剔除（防最终一致性误判）
const EVICT_GRACE_MS = 60 * 1000

async function snapshot(force = false, verify = false) {
  const index = force ? null : await readIndex()
  if (index && !verify) return index
  if (index && verify) {
    const now = Date.now()
    let changed = false
    for (let i = 0; i < index.length; i++) {
      const body = await IMG_RECORDS_KV.get(recordKeyOf(safeIdOf(index[i].id)), { type: 'json' })
      if (!body) {
        // 本体暂时读不到：宽限期内视为仍在（读写延迟），超时才判定已删除并从索引剔除
        if (now - (Number(index[i].createdAt) || 0) < EVICT_GRACE_MS) continue
        // 本体已不存在（如被彻底删除）：从索引剔除
        index.splice(i, 1)
        i--
        changed = true
        continue
      }
      if (body.deletedAt !== index[i].deletedAt) {
        index[i] = { ...index[i], deletedAt: body.deletedAt }
        changed = true
      }
    }
    if (changed) await writeIndex(index)
    return index
  }
  const records = await listRecords()
  // 全表扫描为空时不写空索引：KV.list 可能不可用（返回空≠真没数据），
  // 固化空索引会把全部历史记录永久埋掉；后续写入路径会自行追加索引条目
  if (records.length === 0) return []
  const rebuilt = buildIndex(records)
  await writeIndex(rebuilt)
  return rebuilt
}

// 惰性清理：软删除超过保留期的记录物理移除（记录本体 + 索引条目同步清除）。
// cnbCleanup=true 时顺带删除 CNB 原图（每次调用有上限，避免读路径被网络请求拖垮；
// 失败仅留孤儿文件，可由孤儿扫描兜底）。需 env 提供 SLUG_IMG/TOKEN_IMG。
const CNB_PURGE_MAX_RECORDS = 20

async function purgeExpired(records, env = null, cnbCleanup = false) {
  const now = Date.now()
  const expiredAll = records.filter(
    (r) => r.deletedAt && now - r.deletedAt > SOFT_DELETE_TTL_MS,
  )
  if (expiredAll.length === 0) return records
  // 每轮只处理前 N 条。顺序：先删源文件，全部成功的记录才删除记录体；
  // 源文件删除失败的记录保留在回收站（deletedAt 保持），由后续每次读取自动重试——
  // 绝不出现"记录已删、源文件成孤儿"的窗口（旧实现先删记录体、源文件尽力而为，
  // 失败即永久失去记录引用）。
  const expired = expiredAll.slice(0, CNB_PURGE_MAX_RECORDS)

  let okCnb = new Set()
  if (cnbCleanup && env) {
    const cnbPaths = [...new Set(expired.flatMap((r) => recordSources(r).map((x) => x.path)))]
    if (cnbPaths.length > 0) {
      try {
        const res = await deleteCnbFiles(env, cnbPaths)
        okCnb = new Set(res.ok)
      } catch {
        // 尽力而为：失败留在回收站自动重试
      }
    }
  }

  // 逐条判定：全部源文件均已删除（或本就没有）→ 删除记录体；有失败 → 保留待重试
  const fullyPurged = expired.filter((r) =>
    recordSources(r).every((x) => okCnb.has(x.path)),
  )
  for (let i = 0; i < fullyPurged.length; i += 100) {
    await Promise.all(
      fullyPurged.slice(i, i + 100).map((r) => IMG_RECORDS_KV.delete(recordKeyOf(safeIdOf(r.id)))),
    )
  }
  const purgedIds = new Set(fullyPurged.map((r) => r.id))
  const rest = records.filter((r) => !purgedIds.has(r.id))
  // 快路径不再读本体对账，索引剔除必须在这里显式完成（仅剔除已完全清理的条目）
  await writeIndex(buildIndex(rest))
  return rest
}

// ---------------------------------------------------------------- 统计 / 切片

// tzOffsetMinutes：前端 new Date().getTimezoneOffset() 的值（分钟，东八区为 -480），
// 使“今日上传”按用户本地 0 点切分；缺省回退服务器时区 0 点（边缘环境即 UTC）
function buildStats(records, tzOffsetMinutes = null) {
  const byType = {}
  let totalSize = 0
  let trashedSize = 0
  let trashed = 0
  let todayCount = 0
  let dayStartTs
  if (Number.isFinite(tzOffsetMinutes)) {
    const nowMs = Date.now()
    // 用户本地 0 点：本地时钟对日取整后，再按偏移量换回 UTC 时间戳
    dayStartTs =
      Math.floor((nowMs - tzOffsetMinutes * 60000) / 86400000) * 86400000 + tzOffsetMinutes * 60000
  } else {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    dayStartTs = dayStart.getTime()
  }
  for (const r of records) {
    if (r.deletedAt) {
      // 软删除记录的原图仍占用 CNB 存储（删除不落盘），单独暴露体积便于用户感知
      trashed++
      trashedSize += Number(r.size) || 0
      continue
    }
    const ext = (r.type || '').split('/')[1] || 'other'
    byType[ext] = (byType[ext] || 0) + 1
    totalSize += Number(r.size) || 0
    if (Number(r.createdAt) >= dayStartTs) todayCount++
  }
  return {
    count: records.length - trashed,
    totalSize,
    trashed,
    trashedSize,
    todayCount,
    byType,
  }
}

// 排序 + 切片：服务端完成排序与分页，响应里只带当前页（total 由过滤结果长度提供）
function sortRecords(records, sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1
  const sorted = [...records].sort((a, b) => {
    if (sortKey === 'size') return ((Number(a.size) || 0) - (Number(b.size) || 0)) * dir
    if (sortKey === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN') * dir
    return ((Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)) * dir
  })
  return sorted
}


// ===== CNB 平台资产清单（孤儿文件扫描）=====
// 官方接口 GET /{slug}/-/list-assets（分页，令牌需 repo-manage:r）。
// 孤儿 = 平台清单中存在、但没有任何上传记录（含回收站）引用的 slug_img 资源。
// 本模块只做读取对比；删除复用 node-functions 的 POST /api/file/delete-cnb
// （DELETE /-/imgs/{imgPath}，令牌需 repo-manage:rw）。
const CNB_LIST_PAGE_SIZE = 100
const CNB_LIST_MAX_PAGES = 30 // 单次扫描上限 3000 个资产，超出标记 truncated
const CNB_LIST_TIMEOUT_MS = 10000

// 与 node-functions/api/_utils.ts 的 extractCnbImgPath 同规则：兼容 /api/img/ 与原生 -/imgs/、-/files/ 链接
function cnbPathOf(recordUrl) {
  const raw = String(recordUrl || '')
  const markers = ['/api/f/', '-/files/']
  for (const marker of markers) {
    const idx = raw.indexOf(marker)
    if (idx >= 0) {
      const p = raw.slice(idx + marker.length).split(/[?#]/)[0]
      if (p) return p
    }
  }
  return null
}

// 平台资产的 path → fileKey（可能带 -/files/ 前缀，也可能已是裸路径）
function normalizeAssetPath(assetPath) {
  const raw = String(assetPath || '')
  const idx = raw.indexOf('-/files/')
  if (idx >= 0) {
    const p = raw.slice(idx + '-/files/'.length).split(/[?#]/)[0]
    return p || null
  }
  const p = raw.split(/[?#]/)[0]
  return p || null
}

// 分页拉取仓库全部附件资产：{ ok, assets?, others?, truncated?, reason? }
// 仅收集经 -/upload/files 上传的附件（path 含 -/files/），其他类型计数后跳过
async function listCnbAssets(env) {
  const slug = env?.CNB_REPO
  const token = env?.CNB_TOKEN
  if (!slug || !token) return { ok: false, reason: 'missing-env' }
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.cnb.api+json' }
  const assets = []
  let others = 0
  try {
    for (let page = 1; page <= CNB_LIST_MAX_PAGES; page++) {
      const resp = await Promise.race([
        fetch(`https://api.cnb.cool/${slug}/-/list-assets?page=${page}&page_size=${CNB_LIST_PAGE_SIZE}`, { headers }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), CNB_LIST_TIMEOUT_MS)),
      ])
      if (resp.status === 403) return { ok: false, reason: 'forbidden' }
      if (!resp.ok) return { ok: false, reason: 'upstream' }
      // CNB 空仓库返回字面量 null 而非 []，需兜底
      const list = (await resp.json()) || []
      if (!Array.isArray(list)) return { ok: false, reason: 'upstream' }
      for (const item of list) {
        if (item?.path && String(item.path).includes('-/files/')) {
          const path = normalizeAssetPath(item.path)
          if (path) {
            assets.push({ path, size: Number(item.size_in_byte) || 0, createdAt: String(item.created_at || '') })
          }
        } else {
          others++
        }
      }
      if (list.length < CNB_LIST_PAGE_SIZE) return { ok: true, assets, others, truncated: false }
    }
  } catch {
    return { ok: false, reason: 'network' }
  }
  return { ok: true, assets, others, truncated: true }
}

// ===== CNB 源文件删除（彻底删除 / 30 天过期清理联动）=====
// 原生附件接口 DELETE /{repo}/-/files/{fileKey}（需令牌 repo-manage:rw）。尽力而为：
// 失败仅留孤儿文件（孤儿扫描可兜底），404 视为成功（文件本就不存在）。
// 与 node-functions/api/_utils.ts 的 deleteFromCnb 同规则；此处供边缘函数直接闭环调用
const CNB_DELETE_CHUNK = 50
const CNB_DELETE_TIMEOUT_MS = 15000

// imgPath 白名单：Unicode 字母数字 + ._-/；禁止路径遍历与反斜杠
function isValidFileKey(p) {
  if (!p || p.length > 512) return false
  if (p.startsWith('/') || p.includes('\\') || p.includes('..')) return false
  return /^[\p{L}\p{N}._\-/]+$/u.test(p)
}

// 分块并发删除 CNB 源文件；自身不抛出，返回逐路径结果
// { ok: string[], failed: string[], skipped: number }（404 视为成功）。
// 缺少 env 配置时所有有效路径计入 failed（如实上报"未删除"，不谎报成功）。
async function deleteCnbFiles(env, paths) {
  const ok = []
  const failed = []
  const slug = env?.CNB_REPO
  const token = env?.CNB_TOKEN
  const all = Array.isArray(paths) ? paths : []
  const unique = [...new Set(all.filter((p) => typeof p === 'string' && isValidFileKey(p)))]
  const skipped = all.length - unique.length
  if (!slug || !token || unique.length === 0) {
    return { ok, failed: [...unique], skipped }
  }

  for (let i = 0; i < unique.length; i += CNB_DELETE_CHUNK) {
    const results = await Promise.all(
      unique.slice(i, i + CNB_DELETE_CHUNK).map(async (imgPath) => {
        const encoded = imgPath.split('/').map(encodeURIComponent).join('/')
        let timer
        try {
          const resp = await Promise.race([
            fetch(`https://api.cnb.cool/${slug}/-/files/${encoded}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            }),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('timeout')), CNB_DELETE_TIMEOUT_MS)
            }),
          ])
          return resp.ok || resp.status === 404
        } catch {
          return false
        } finally {
          clearTimeout(timer)
        }
      }),
    )
    for (let j = 0; j < results.length; j++) {
      ;(results[j] ? ok : failed).push(unique[i + j])
    }
  }
  return { ok, failed, skipped }
}

// 单条记录的源文件 fileKey 列表：{ kind: 'cnb', path }
function recordSources(record) {
  const out = []
  for (const u of [record?.url, record?.thumbnailUrl]) {
    if (!u) continue
    const p = cnbPathOf(u)
    if (p) out.push({ kind: 'cnb', path: p })
  }
  return out
}

// ---------------------------------------------------------------- 分享 token
// KV: share_{token} -> { recordId, createdAt }；shareidx_{recordId} -> [tokens]
const SHARE_PREFIX = 'share_'
const SHARE_IDX_PREFIX = 'shareidx_'

function randomToken(n) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < n; i++) out += chars[buf[i] % chars.length]
  return out
}

async function createShareToken(recordId) {
  const token = randomToken(16)
  await IMG_RECORDS_KV.put(`${SHARE_PREFIX}${token}`, JSON.stringify({ recordId, createdAt: Date.now() }))
  const idxKey = `${SHARE_IDX_PREFIX}${safeIdOf(recordId)}`
  let list = []
  try {
    const raw = await IMG_RECORDS_KV.get(idxKey, { type: 'json' })
    if (Array.isArray(raw)) list = raw
  } catch { /* ignore */ }
  list.push(token)
  await IMG_RECORDS_KV.put(idxKey, JSON.stringify(list.slice(-20)))
  return token
}

async function getShareRecord(token) {
  const t = String(token || '').replace(/[^a-zA-Z0-9]/g, '')
  if (!t) return null
  let ref = null
  try {
    ref = await IMG_RECORDS_KV.get(`${SHARE_PREFIX}${t}`, { type: 'json' })
  } catch { /* ignore */ }
  if (!ref?.recordId) return null
  let record = null
  try {
    record = await IMG_RECORDS_KV.get(recordKeyOf(safeIdOf(ref.recordId)), { type: 'json' })
  } catch { /* ignore */ }
  if (!record || record.deletedAt) return null
  return record
}

async function deleteShareTokensForRecord(recordId) {
  const idxKey = `${SHARE_IDX_PREFIX}${safeIdOf(recordId)}`
  let list = []
  try {
    const raw = await IMG_RECORDS_KV.get(idxKey, { type: 'json' })
    if (Array.isArray(raw)) list = raw
  } catch { /* ignore */ }
  await Promise.all(list.map((t) => IMG_RECORDS_KV.delete(`${SHARE_PREFIX}${t}`).catch(() => {})))
  await IMG_RECORDS_KV.delete(idxKey).catch(() => {})
}

// ===== 站点设置云端同步（上传偏好 + 主题）=====
// 单口令站点无用户体系：设置是站点级文档，登录即拉取、改动回写，全设备一致。
// 本地 localStorage 仍是即时层（离线兜底/无闪白），云端为准据源。
const SITE_SETTINGS_KEY = 'site_settings'
const SITE_SETTINGS_MAX_BYTES = 10 * 1024

function clampNum(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// 白名单 + 钳制：与前端 useUploadSettings 的本地校验同规则，恶意/越界值不落盘
function normalizeSiteSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const out = {}
  const us = input.uploadSettings
  if (us && typeof us === 'object' && !Array.isArray(us)) {
    out.uploadSettings = {
      quality: clampNum(us.quality, 0.3, 0.95, 0.7),
      generateThumbnail: us.generateThumbnail !== false,
      keepOriginal: us.keepOriginal === true,
      maxDimension: clampNum(us.maxDimension, 0, 20000, 0),
      namingRule: ['original', 'timestamp', 'random'].includes(us.namingRule) ? us.namingRule : 'timestamp',
      defaultCopyFormat: ['url', 'markdown', 'html', 'bbcode'].includes(us.defaultCopyFormat) ? us.defaultCopyFormat : 'url',
      autoCopy: us.autoCopy === true,
      pageSize: [10, 20, 50, 100].includes(us.pageSize) ? us.pageSize : 20,
    }
  }
  if (['light', 'dark', 'system'].includes(input.theme)) out.theme = input.theme
  return Object.keys(out).length > 0 ? out : null
}

async function readSiteSettings() {
  try {
    const doc = await IMG_RECORDS_KV.get(SITE_SETTINGS_KEY, { type: 'json' })
    if (doc && typeof doc === 'object') return doc
  } catch {
    // KV 不可用按未同步处理（前端维持本机设置）
  }
  return null
}

async function writeSiteSettings(normalized) {
  const doc = { ...normalized, updatedAt: Date.now() }
  const raw = JSON.stringify(doc)
  if (raw.length > SITE_SETTINGS_MAX_BYTES) {
    return { ok: false, msg: '设置内容超出大小限制' }
  }
  await IMG_RECORDS_KV.put(SITE_SETTINGS_KEY, raw)
  return { ok: true, doc }
}

export {
  INDEX_KEY,
  INDEX_SAFE_LIMIT_BYTES,
  INDEX_SHARD_PREFIX,
  json,
  verifyAuthToken,
  isAuthorized,
  isRateLimited,
  getClientIp,
  safeIdOf,
  recordKeyOf,
  readIndex,
  listRecords,
  buildIndex,
  writeIndex,
  snapshot,
  purgeExpired,
  buildStats,
  sortRecords,
  cnbPathOf,
  normalizeAssetPath,
  listCnbAssets,
  isValidFileKey,
  deleteCnbFiles,
  recordSources,
  createShareToken,
  getShareRecord,
  deleteShareTokensForRecord,
  SITE_SETTINGS_KEY,
  normalizeSiteSettings,
  readSiteSettings,
  writeSiteSettings,
}
