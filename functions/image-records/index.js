// 图片/视频记录的 KV 边缘函数：记录 CRUD、回收站、分享 token、站点设置、孤儿扫描
// 软删除记录保留 30 天，过期由读取时惰性清理

import {
  json,
  isAuthorized,
  isRateLimited,
  getClientIp,
  safeIdOf,
  recordKeyOf,
  readIndex,
  buildIndex,
  buildStats,
  writeIndex,
  snapshot,
  purgeExpired,
  sortRecords,
  cnbPathOf,
  listCnbAssets,
  deleteCnbFiles,
  recordSources,
  createShareToken,
  getShareRecord,
  deleteShareTokensForRecord,
  normalizeSiteSettings,
  readSiteSettings,
  writeSiteSettings,
} from './_lib.js'

// 每条记录落盘的最简形状
function normalizeRecord(record) {
  const size = Number(record.size)
  const width = Number(record.width)
  const height = Number(record.height)
  const clip = (v, max) => {
    const s = String(v ?? '')
    return s.length > max ? s.slice(0, max) : s
  }
  return {
    id: record.id,
    name: clip(record.name, 200),
    url: clip(record.url, 1024),
    thumbnailUrl: record.thumbnailUrl ? clip(record.thumbnailUrl, 1024) : undefined,
    size: Number.isFinite(size) && size > 0 ? Math.round(size) : 0,
    type: clip(record.type, 100),
    isVideo: record.isVideo === true,
    createdAt: Number(record.createdAt) || Date.now(),
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : undefined,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : undefined,
  }
}

async function upsertRecord(normalized) {
  const existing = await IMG_RECORDS_KV.get(recordKeyOf(safeIdOf(normalized.id)), { type: 'json' })
  if (!existing) {
    const all = await readIndex()
    if (all) {
      const byUrl = all.find((r) => r.url === normalized.url && !r.deletedAt)
      if (byUrl) {
        normalized.id = byUrl.id
        normalized.createdAt = byUrl.createdAt
      }
    }
  }
  await IMG_RECORDS_KV.put(recordKeyOf(safeIdOf(normalized.id)), JSON.stringify(normalized))
  await updateIndex(normalized)
  return normalized
}

async function updateIndex(normalized) {
  const index = (await readIndex()) || []
  const entry = {
    id: normalized.id,
    name: normalized.name,
    url: normalized.url,
    thumbnailUrl: normalized.thumbnailUrl,
    size: normalized.size,
    type: normalized.type,
    isVideo: normalized.isVideo,
    createdAt: normalized.createdAt,
    width: normalized.width,
    height: normalized.height,
    deletedAt: undefined,
  }
  const pos = index.findIndex((r) => r.id === normalized.id)
  if (pos >= 0) index[pos] = { ...index[pos], ...entry, deletedAt: index[pos].deletedAt }
  else index.unshift(entry)
  await writeIndex(index)
}

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url)

    // ===== 分享页公开读取（无需登录）=====
    if (request.method === 'GET' && url.searchParams.get('share')) {
      const record = await getShareRecord(url.searchParams.get('share'))
      if (!record) return json(1, '分享不存在或已删除', null, 404)
      return json(0, '获取成功', {
        id: record.id,
        name: record.name,
        url: record.url,
        thumbnailUrl: record.thumbnailUrl,
        size: record.size,
        type: record.type,
        isVideo: !!record.isVideo,
        createdAt: record.createdAt,
        width: record.width,
        height: record.height,
      })
    }

    // ===== 以下均需登录 =====
    if (!(await isAuthorized(request, env))) {
      return json(401, '未登录', null, 401)
    }

    const ip = getClientIp(request)
    if (request.method !== 'GET') {
      if (await isRateLimited(`write:${ip}`, 120)) return json(429, '请求过于频繁，请稍后再试', null, 429)
    } else if (await isRateLimited(`read:${ip}`, 120)) {
      return json(429, '请求过于频繁，请稍后再试', null, 429)
    }

    async function records(force = false, verify = false) {
      const all = await snapshot(force, verify)
      return purgeExpired(all, env, true)
    }

    // ===== 创建分享 token =====
    if (request.method === 'POST' && url.searchParams.get('share-create') === '1') {
      const body = await request.json().catch(() => null)
      const recordId = String(body?.recordId || '')
      if (!recordId) return json(1, '缺少 recordId', null, 400)
      const record = await IMG_RECORDS_KV.get(recordKeyOf(safeIdOf(recordId)), { type: 'json' })
      if (!record || record.deletedAt) return json(1, '记录不存在', null, 404)
      const token = await createShareToken(record.id)
      return json(0, '创建成功', { token })
    }

    // ===== 孤儿扫描（只读）=====
    if (request.method === 'GET' && url.searchParams.get('cnb-assets') === '1') {
      const listed = await listCnbAssets(env)
      if (!listed.ok) {
        const msgs = {
          'missing-env': '缺少 CNB_REPO 或 CNB_TOKEN 配置',
          forbidden: '访问令牌缺少 repo-manage:r 权限',
          upstream: 'CNB 资产接口返回异常',
          network: 'CNB 资产接口连接失败',
        }
        return json(1, msgs[listed.reason] || 'CNB 资产接口不可用', null)
      }
      const all = await records()
      const referenced = new Set()
      for (const record of all) {
        for (const u of [record.url, record.thumbnailUrl]) {
          const p = cnbPathOf(u)
          if (p) referenced.add(p)
        }
      }
      const orphans = listed.assets.filter((asset) => !referenced.has(asset.path))
      return json(0, '获取成功', {
        scanned: listed.assets.length + listed.others,
        otherTypes: listed.others,
        orphans: orphans.slice(0, 1000),
        orphansTruncated: orphans.length > 1000,
        truncated: listed.truncated,
      })
    }

    // ===== 站点设置 =====
    if (request.method === 'GET' && url.searchParams.get('site-settings') === '1') {
      return json(0, '获取成功', await readSiteSettings())
    }
    if (request.method === 'POST' && url.searchParams.get('site-settings') === '1') {
      const body = await request.json().catch(() => null)
      const normalized = normalizeSiteSettings(body)
      if (!normalized) return json(1, '设置内容无效', null, 400)
      const saved = await writeSiteSettings(normalized)
      if (!saved.ok) return json(1, saved.msg, null, 400)
      return json(0, '已同步', saved.doc)
    }

    // ===== 列表查询 =====
    if (request.method === 'GET') {
      const forceRebuild = url.searchParams.get('rebuild') === '1'
      const verifyIndex = url.searchParams.get('verify') === '1'
      const all = await records(forceRebuild, verifyIndex)
      const showTrash = url.searchParams.get('trash') === '1'
      // ?type=image|video 按类型筛选
      const typeFilter = url.searchParams.get('type')
      let filtered = showTrash ? all.filter((r) => r.deletedAt) : all.filter((r) => !r.deletedAt)
      if (typeFilter === 'image') filtered = filtered.filter((r) => !r.isVideo)
      else if (typeFilter === 'video') filtered = filtered.filter((r) => !!r.isVideo)
      // ?q= 搜索（名称）
      const q = (url.searchParams.get('q') || '').trim().toLowerCase()
      if (q) filtered = filtered.filter((r) => String(r.name || '').toLowerCase().includes(q))

      const tzRaw = url.searchParams.get('tz')
      const tz = tzRaw === null ? null : Number(tzRaw)
      const stats = buildStats(all, tz)

      if (forceRebuild) {
        const rebuilt = sortRecords(filtered, 'createdAt', 'desc')
        return json(0, `索引已重建：有效 ${rebuilt.length} 条，回收站 ${stats.trashed} 条`, {
          records: rebuilt, total: rebuilt.length, stats,
        })
      }

      const recentParam = Number(url.searchParams.get('recent'))
      if (Number.isFinite(recentParam) && recentParam > 0) {
        const n = Math.min(50, Math.round(recentParam))
        const slice = sortRecords(filtered, 'createdAt', 'desc').slice(0, n)
        return json(0, '获取成功', { records: slice, stats })
      }

      const sortKey = ['name', 'size', 'createdAt'].includes(url.searchParams.get('sort'))
        ? url.searchParams.get('sort') : 'createdAt'
      const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
      const sorted = sortRecords(filtered, sortKey, dir)

      const limitParam = Number(url.searchParams.get('limit'))
      const offsetParam = Number(url.searchParams.get('offset'))
      if (Number.isFinite(limitParam) && limitParam > 0) {
        const limit = Math.min(500, Math.round(limitParam))
        const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.round(offsetParam) : 0
        return json(0, '获取成功', { records: sorted.slice(offset, offset + limit), total: sorted.length, stats })
      }
      if (url.searchParams.get('stats') === '1') {
        return json(0, '获取成功', { records: sorted, stats })
      }
      return json(0, '获取成功', sorted)
    }

    // ===== 写入记录 =====
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null)
      if (body && Array.isArray(body.records)) {
        if (body.records.length > 50) return json(1, '单次最多 50 条记录', null, 400)
        const items = body.records.slice(0, 50)
        if (items.length === 0) return json(1, '记录列表为空', null, 400)
        const invalid = items.findIndex((r) => !r?.id || !r?.url || !r?.createdAt)
        if (invalid >= 0) return json(1, `第 ${invalid + 1} 条记录缺少必要字段`, null, 400)
        const normalizedItems = items.map((raw) => normalizeRecord(raw))
        for (const normalized of normalizedItems) {
          if (!safeIdOf(normalized.id)) return json(1, '无效的记录 ID', null, 400)
        }
        await Promise.all(
          normalizedItems.map((n) => IMG_RECORDS_KV.put(recordKeyOf(safeIdOf(n.id)), JSON.stringify(n))),
        )
        const all = await records()
        const byId = new Map(normalizedItems.map((n) => [n.id, n]))
        const existingIds = new Set(all.map((r) => r.id))
        const freshIds = new Set()
        const fresh = buildIndex(normalizedItems).filter((e) => {
          if (existingIds.has(e.id) || freshIds.has(e.id)) return false
          freshIds.add(e.id)
          return true
        })
        const merged = [...fresh, ...all]
          .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
          .map((entry) => {
            const n = byId.get(entry.id)
            if (!n) return entry
            return { ...entry, name: n.name, url: n.url, thumbnailUrl: n.thumbnailUrl, size: n.size, type: n.type, isVideo: n.isVideo, createdAt: n.createdAt, width: n.width, height: n.height, deletedAt: undefined }
          })
        await writeIndex(merged)
        return json(0, `已保存 ${items.length} 条记录`, { ok: items.length })
      }
      const record = body
      if (!record?.id || !record?.url || !record?.createdAt) {
        return json(1, '记录缺少必要字段', null, 400)
      }
      const safeId = safeIdOf(record.id)
      if (!safeId) return json(1, '无效的记录 ID', null, 400)
      const saved = await upsertRecord(normalizeRecord(record))
      return json(0, '保存成功', { id: saved.id })
    }

    // ===== PUT：从回收站恢复 =====
    if (request.method === 'PUT') {
      const ids = url.searchParams.getAll('id').slice(0, 100)
      if (ids.length === 0) return json(1, 'ID不能为空', null, 400)
      let ok = 0
      for (const id of ids) {
        const key = recordKeyOf(safeIdOf(id))
        const record = await IMG_RECORDS_KV.get(key, { type: 'json' })
        if (!record) continue
        delete record.deletedAt
        await IMG_RECORDS_KV.put(key, JSON.stringify(record))
        ok++
      }
      if (ok > 0) {
        const index = await readIndex()
        if (index) {
          const targetSet = new Set(ids)
          let changed = false
          for (let i = 0; i < index.length; i++) {
            if (targetSet.has(index[i].id) && index[i].deletedAt) {
              index[i] = { ...index[i], deletedAt: undefined }
              changed = true
            }
          }
          if (changed) await writeIndex(index)
        } else {
          await snapshot()
        }
      }
      return json(0, `已恢复 ${ok} 条记录`, { ok, fail: ids.length - ok })
    }

    // ===== DELETE：软删除进回收站；?purge=1 彻底删除（联动删 CNB 源文件 + 分享 token）=====
    if (request.method === 'DELETE') {
      const ids = url.searchParams.getAll('id').slice(0, 100)
      if (ids.length === 0) return json(1, 'ID不能为空', null, 400)
      const purge = url.searchParams.get('purge') === '1'
      let ok = 0, fail = 0, sourceFailed = 0
      const recordsToPurge = []

      for (const id of ids) {
        const key = recordKeyOf(safeIdOf(id))
        const record = await IMG_RECORDS_KV.get(key, { type: 'json' })
        if (!record) continue
        if (purge) {
          recordsToPurge.push(record)
        } else {
          record.deletedAt = Date.now()
          await IMG_RECORDS_KV.put(key, JSON.stringify(record))
        }
        ok++
      }

      if (!purge && ok > 0) {
        const index = await readIndex()
        if (index) {
          const targetSet = new Set(ids)
          let changed = false
          for (let i = 0; i < index.length; i++) {
            if (targetSet.has(index[i].id)) {
              const rec = await IMG_RECORDS_KV.get(recordKeyOf(safeIdOf(index[i].id)), { type: 'json' }).catch(() => null)
              index[i] = { ...index[i], deletedAt: rec?.deletedAt }
              changed = true
            }
          }
          if (changed) await writeIndex(index)
        } else {
          await snapshot()
        }
      }

      if (purge && recordsToPurge.length > 0) {
        const cnbPaths = [...new Set(recordsToPurge.flatMap((r) => recordSources(r).map((x) => x.path)))]
        let okCnb = new Set()
        if (cnbPaths.length > 0) {
          try {
            const res = await deleteCnbFiles(env, cnbPaths)
            okCnb = new Set(res.ok)
          } catch { /* 尽力而为 */ }
        }
        const fullyPurged = recordsToPurge.filter((r) =>
          recordSources(r).every((x) => okCnb.has(x.path)))
        sourceFailed = recordsToPurge.length - fullyPurged.length
        if (fullyPurged.length > 0) {
          const purgedIds = new Set(fullyPurged.map((r) => r.id))
          for (let i = 0; i < fullyPurged.length; i += 100) {
            await Promise.all(fullyPurged.slice(i, i + 100).map((r) => {
              IMG_RECORDS_KV.delete(recordKeyOf(safeIdOf(r.id)))
              return deleteShareTokensForRecord(r.id)
            }))
          }
          const index = await readIndex()
          if (index) {
            const rest = index.filter((e) => !purgedIds.has(e.id))
            if (rest.length !== index.length) await writeIndex(rest)
          } else {
            await snapshot()
          }
          ok = fullyPurged.length
          fail = ids.length - ok
        } else {
          ok = 0
          fail = ids.length
        }
      }

      return json(0, purge
        ? (sourceFailed > 0 ? `已彻底删除 ${ok} 条，${sourceFailed} 条源文件删除失败（记录已保留在回收站，可重试）` : `已彻底删除 ${ok} 条记录`)
        : `已移入回收站 ${ok} 条`, { ok, fail, sourceFailed })
    }

    return json(405, '不支持的请求方法', null, 405)
  } catch (error) {
    console.error('KV operation failed:', error)
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return json(1, `操作失败: ${reason}`, null, 500)
  }
}
