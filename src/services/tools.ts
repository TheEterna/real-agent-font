import http from './http'

export async function listTools(){
  try{
    const data = await http.get('/tools')
    return Array.isArray(data)? data: (data?.items||[])
  }catch{
    // 后端未就绪时返回占位数据
    return [
      { name: 'http.request', description: 'HTTP 请求工具', category: 'network' },
      { name: 'math.eval', description: '数学表达式求值', category: 'utility' },
      { name: 'time.now', description: '获取当前时间', category: 'utility' }
    ]
  }
}

export async function executeTool(toolName: string, args: any){
  return http.post('/tools/execute', { toolName, args })
}
