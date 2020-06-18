import {DataConsumer, DataSupplier, MessageType, Topic, TopicImpl} from "./rpc"
import {createMessageId} from "./utils"
import {RpcSession} from "./RpcSession"
import {throttle} from "throttle-debounce"

type Reducer<D> = (prevValue: D, newValue: D) => D

export function lastValueReducer<D>(prevValue: D, newValue: D): D {
  return newValue
}

// Intentionally skipped type checks b/c types are checked with isArray
export function groupReducer<D>(prevValue: any, newValue: any): any {
  if (!Array.isArray(newValue))
    throw new Error("groupReducer should only be used with topics that return arrays")

  return prevValue ? [...prevValue, ...newValue] : newValue
}

/** LocalTopicImpl should implement Topic (and RemoteTopic) so it could be used in ServiceImpl */
export class LocalTopicImpl<D, F> extends TopicImpl implements Topic<D, F> {
  constructor(private supplier: DataSupplier<D, F>) {
    super()
  }

  public name: string

  trigger(filter: Partial<F> = {}, suppliedData?: D): void {
    for (const subscription of Object.values(this.subscriptions)) {
      if (filterContains(filter, subscription.filter)) {
        subscription.trigger(suppliedData)
      }
    }
  }

  async getData(filter: F, ctx: any): Promise<D> {
    return await this.supplier(filter, ctx)
  }

  private throttleTimeout: number = null

  public throttle(timeout: number, reducer: Reducer<D> = lastValueReducer): LocalTopicImpl<D, F> {
    this.throttleTimeout = timeout
    return this
  }

  private throttled<T>(f: T): T {
    if (!this.throttleTimeout) return f

    return throttle(this.throttleTimeout, f)
  }

  async subscribeSession(session: RpcSession, filter: F) {
    const key = JSON.stringify(filter)

    const localTopic = this

    const subscription: Subscription<F, D> = this.subscriptions[key] || {
      filter,
      sessions: [],
      trigger: this.throttled(function(suppliedData) {
        // data cannot be cached between subscribers, b/c for different subscriber there could be a different context
        this.sessions.forEach(async session => {
          const data: D =
            suppliedData !== undefined
              ? suppliedData
              : await localTopic.supplier(filter, session.createContext())

          session.send(MessageType.Data, createMessageId(), localTopic.name, filter, data)
        })
      }),
    }

    // TODO if already subscribed, just send current data, and do not add a new subscription - it will save
    // some network ops

    subscription.sessions.push(session)
    this.subscriptions[key] = subscription

    if (this.supplier) {
      const data = await this.supplier(filter, session.createContext())
      session.send(MessageType.Data, createMessageId(), this.name, filter, data)
    }
  }

  unsubscribeSession(session: RpcSession, filter: F) {
    const key = JSON.stringify(filter)

    const subscription = this.subscriptions[key]
    if (!subscription) return

    const index = subscription.sessions.indexOf(session)
    subscription.sessions.splice(index, 1)

    if (!subscription.sessions.length) {
      delete this.subscriptions[key]
    }
  }

  private subscriptions: {[key: string]: Subscription<F, D>} = {}

  // dummy implementations, see class comment

  get(params?: F): Promise<D> {
    return undefined
  }
  subscribe(consumer: DataConsumer<D>, params: F, subscriptionKey: any): void {}
  unsubscribe(params?: F, subscriptionKey?: any) {}
}

function filterContains(container, filter): boolean {
  if (filter == null) return true // subscribe to all data
  if (container == null) return true // all data modified

  for (const key of Object.keys(filter)) {
    if (container[key] == undefined) continue
    if (filter[key] == container[key]) continue

    if (Array.isArray(container[key]) && Array.isArray(filter[key])) {
      if (JSON.stringify(container[key]) == JSON.stringify(filter[key])) {
        continue
      }
    }

    return false
  }

  return true
}

interface Subscription<F, D> {
  filter: F
  sessions: RpcSession[]
  trigger(suppliedData: D): void
}

/**
 * 1. Set name on topics
 * 2. Bind this to remote methods
 */
export function prepareLocal(services, prefix = "") {
  const keys = getObjectProps(services)

  keys.forEach(key => {
    const item = services[key]

    if (typeof item == "object") {
      const name = prefix + key

      if (item instanceof LocalTopicImpl) {
        item.name = name
        return
      }

      return prepareLocal(item, name + "/")
    }
  })
}

function getObjectProps(obj) {
  let props = []

  while (!!obj && obj != Object.prototype) {
    props = props.concat(Object.getOwnPropertyNames(obj))
    obj = Object.getPrototypeOf(obj)
  }

  return Array.from(new Set(props)).filter(p => p != "constructor")
}
