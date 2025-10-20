// SSE极客模式集成
// 专门处理极客模式下的SSE事件与终端的集成

import { ref, type Ref } from 'vue'
import type { BaseEventItem } from '@/types/events'
import type { UseSSETerminalAdapterReturn } from './useSSETerminalAdapter'
import type { Terminal } from '@xterm/xterm'

export interface UseSSEGeekModeOptions {
  terminalAdapter: UseSSETerminalAdapterReturn
  sessionId: string
  onError?: (error: Error) => void
  onComplete?: () => void
}

export function useSSEGeekMode(options: UseSSEGeekModeOptions) {
  const { terminalAdapter, sessionId } = options

  const isConnected = ref(false)
  const isExecuting = ref(false)
  const currentSource = ref<any>(null)

  // 关闭SSE连接
  const closeSource = (source: any) => {
    try {
      if (source && typeof source.close === 'function') {
        source.close()
      }
    } catch (e) {
      console.error('Error closing SSE source:', e)
    }
  }

  // 处理SSE事件
  const handleSSEEvent = async (event: BaseEventItem, source: any) => {
    try {
      // 直接转发给终端适配器处理
      await terminalAdapter.handleSSEEvent(event)

      // 处理特殊事件
      switch (event.type) {
        case 'COMPLETED':
          isConnected.value = false
          isExecuting.value = false
          closeSource(source)
          options.onComplete?.()
          break

        case 'ERROR':
          isConnected.value = false
          isExecuting.value = false
          closeSource(source)
          options.onError?.(new Error(event.message || 'Unknown error'))
          break
      }
    } catch (error) {
      console.error('Error handling SSE event:', error)
      await terminalAdapter.writeError(`处理事件失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 执行极客模式命令
  const executeGeekCommand = async (text: string): Promise<void> => {
    if (isExecuting.value) {
      await terminalAdapter.writeWarning('⚠️ 正在执行中，请稍候...')
      return
    }

    return new Promise<void>((resolve, reject) => {
      import('sse.js')
        .then(({ SSE }) => {
          isExecuting.value = true

          // 检查是否是命令
          const isCommand = text.startsWith('/')
          const endpoint = isCommand ? '/api/agent/chat/geek/command/stream' : '/api/agent/chat/geek/stream'

          const source = new SSE(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
            payload: JSON.stringify({
              message: text,
              userId: 'user-001',
              sessionId,
              agentType: 'Geek',
              isCommand,
            }),
          })

          currentSource.value = source

          const closeAndResolve = () => {
            closeSource(source)
            currentSource.value = null
            isExecuting.value = false
            isConnected.value = false
            resolve()
          }

          source.addEventListener('open', async () => {
            isConnected.value = true
            await terminalAdapter.writeSystem('🔗 连接已建立')
          })

          source.addEventListener('message', async (event: MessageEvent) => {
            if (!event?.data) return

            try {
              const data = JSON.parse(event.data) as BaseEventItem
              await handleSSEEvent(data, source)
            } catch (error) {
              console.error('Error parsing SSE message:', error)
              await terminalAdapter.writeError(`解析消息失败: ${error instanceof Error ? error.message : String(error)}`)
            }
          })

          source.addEventListener('error', async (err: any) => {
            isConnected.value = false
            isExecuting.value = false
            closeSource(source)
            currentSource.value = null

            const errorMsg = `❌ 连接失败: ${err?.message || err?.type || '未知错误'}`
            await terminalAdapter.writeError(errorMsg)

            reject(new Error('SSE连接失败: ' + (err?.message || err?.type || '未知错误')))
          })

          try {
            (source as any).stream()
          } catch (e: any) {
            reject(new Error('启动SSE流失败: ' + (e?.message || '未知错误')))
          }
        })
        .catch((e) => {
          isExecuting.value = false
          reject(new Error('未能加载 sse.js: ' + (e as Error).message))
        })
    })
  }

  // 中断当前执行
  const interrupt = async () => {
    if (currentSource.value) {
      closeSource(currentSource.value)
      currentSource.value = null
      isConnected.value = false
      isExecuting.value = false
      await terminalAdapter.writeWarning('⚠️ 执行已中断')
    }
  }

  // 清理资源
  const dispose = () => {
    if (currentSource.value) {
      closeSource(currentSource.value)
      currentSource.value = null
    }
    isConnected.value = false
    isExecuting.value = false
  }

  return {
    // 状态
    isConnected,
    isExecuting,

    // 方法
    executeGeekCommand,
    interrupt,
    dispose
  }
}

export type UseSSEGeekModeReturn = ReturnType<typeof useSSEGeekMode>