/**
 * 统一 JSON 响应：{ code, msg, data }
 */
const reply = (code: number, msg: string, data: unknown) => {
  return { code, msg, data }
}

export { reply }
