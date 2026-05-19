const reply = (code: number, msg: string, data: any = null) => {
  return {
    code,
    msg,
    data,
  }
}

export { reply }
