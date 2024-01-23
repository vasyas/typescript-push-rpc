import WebSocket from "ws"
import {log} from "../logger.js"
import {safeParseJson} from "../utils/json.js"

export class WebSocketConnection {
  constructor(
    private readonly url: string,
    private readonly clientId: string,
    private readonly consume: (itemName: string, parameters: unknown[], data: unknown) => void,
    private readonly options: {
      reconnectDelay: number
      errorDelayMaxDuration: number
      pingInterval: number
    }
  ) {
    this.url = url
    this.clientId = clientId
  }

  async close() {
    this.disconnectedMark = true

    if (this.socket) {
      this.socket!.terminate()
      this.socket = null
    }

    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout)
    }

    return Promise.resolve()
  }

  /**
   * Connect to the server, on each disconnect try to disconnect.
   * Resolves at first successful connect. Reconnection loop continues even after resolution
   * Never rejects
   */
  connect() {
    if (this.socket || !this.disconnectedMark) return Promise.resolve()

    this.disconnectedMark = false

    return new Promise<void>(async (resolve) => {
      let onFirstConnection = resolve
      let errorDelay = 0

      while (true) {
        // connect, and wait for ...
        await new Promise<void>((resolve) => {
          // 1. ...disconnected
          const connectionPromise = this.establishConnection(resolve)

          connectionPromise.then(
            () => {
              // first reconnect after successful connection is done without delay
              errorDelay = 0

              // signal about first connection
              onFirstConnection()
              onFirstConnection = () => {}
            },
            () => {
              // 2. ... unable to establish connection
              resolve()
            }
          )
        })

        if (this.disconnectedMark) {
          return
        }

        await new Promise((r) => {
          setTimeout(r, this.options.reconnectDelay + errorDelay)
        })

        errorDelay = Math.round(Math.random() * this.options.errorDelayMaxDuration)
      }
    })
  }

  public isConnected() {
    return this.socket !== null
  }

  /**
   * Connect this to server
   *
   * Resolves on successful connection, rejects on connection error or connection timeout
   */
  private async establishConnection(onDisconnected: () => void): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const socket = new WebSocket(this.url, this.clientId)

        let connected = false

        socket.on("open", () => {
          console.log("Socket open")

          this.socket = socket
          connected = true
          resolve()

          this.heartbeat()
        })

        socket.on("ping", () => {
          console.log("Socket ping")
          this.heartbeat()
        })

        socket.on("close", () => {
          console.log("Socket close")
          this.socket = null

          if (connected) {
            onDisconnected()
          }

          if (this.pingTimeout) {
            clearTimeout(this.pingTimeout)
          }
        })

        socket.on("error", (e) => {
          if (!connected) {
            reject(e)
          }

          log.warn("WS connection error", e.message)

          try {
            socket.close()
          } catch (e) {
            // ignore
          }
        })

        socket.on("message", (message) => {
          this.receiveSocketMessage(message)
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  private socket: WebSocket | null = null
  private disconnectedMark = true
  private pingTimeout: NodeJS.Timeout | null = null

  private heartbeat() {
    console.log("Heartbeat")

    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout)
    }

    this.pingTimeout = setTimeout(() => {
      console.log("Ping timed out")

      this.socket?.terminate()
    }, this.options.pingInterval * 1.5)
  }

  private async receiveSocketMessage(rawMessage: WebSocket.RawData) {
    try {
      const msg = rawMessage.toString()

      const [itemName, data, ...parameters] = safeParseJson(msg)

      this.consume(itemName, parameters, data)
    } catch (e) {
      log.warn("Invalid message received", e)
    }
  }

  // test-only
  _webSocket() {
    return this.socket
  }
}
