import {safeStringify} from "../utils/json.js"

export class LocalSubscriptions {
  subscribe(clientId: string, itemName: string, parameters: unknown[], update: () => void) {
    const itemSubscriptions = this.byItem.get(itemName) || {byFilter: new Map()}
    this.byItem.set(itemName, itemSubscriptions)

    const filterKey = getFilterKey(parameters)

    const subscriptions: FilterSubscription = itemSubscriptions.byFilter.get(filterKey) || {
      filter: parameters?.[0],
      subscribedClients: [],
    }
    itemSubscriptions.byFilter.set(filterKey, subscriptions)

    if (!subscriptions.subscribedClients.some((c) => c.clientId == clientId)) {
      subscriptions.subscribedClients.push({clientId, update})
    }
  }

  unsubscribe(clientId: string, itemName: string, parameters: unknown[]) {
    const itemSubscriptions = this.byItem.get(itemName)
    if (!itemSubscriptions) return

    const filterKey = getFilterKey(parameters)

    const subscriptions = itemSubscriptions.byFilter.get(filterKey)
    if (!subscriptions) return

    subscriptions.subscribedClients = subscriptions.subscribedClients.filter(
      (subscription) => subscription.clientId != clientId
    )

    if (!subscriptions.subscribedClients.length) {
      itemSubscriptions.byFilter.delete(filterKey)

      if (itemSubscriptions.byFilter.size == 0) {
        this.byItem.delete(itemName)
      }
    }
  }

  unsubscribeAll(clientId: string) {
    for (const [itemName, itemSubscriptions] of this.byItem.entries()) {
      for (const [filterKey, subscriptions] of itemSubscriptions.byFilter.entries()) {
        subscriptions.subscribedClients = subscriptions.subscribedClients.filter(
          (subscription) => subscription.clientId != clientId
        )

        if (!subscriptions.subscribedClients.length) {
          itemSubscriptions.byFilter.delete(filterKey)
        }
      }

      if (itemSubscriptions.byFilter.size == 0) {
        this.byItem.delete(itemName)
      }
    }
  }

  trigger(itemName: string, triggerFilter: Record<string, unknown> = {}) {
    const itemSub = this.byItem.get(itemName)
    if (!itemSub) return

    for (const {filter: subscriptionFilter, subscribedClients} of itemSub.byFilter.values()) {
      if (!filterContains(triggerFilter, subscriptionFilter)) continue

      subscribedClients.forEach((subscribedClient) => {
        subscribedClient.update()
      })
    }
  }

  private byItem: Map<string, ItemSubscription> = new Map()

  // test-only
  _allSubscriptions() {
    const result: Array<[string, unknown[], unknown[]]> = []

    for (const [itemName, itemSubscriptions] of this.byItem) {
      for (const [, parameterSubscriptions] of itemSubscriptions.byFilter) {
        result.push([
          itemName,
          [parameterSubscriptions.filter],
          parameterSubscriptions.subscribedClients,
        ])
      }
    }

    return result
  }
}

type ItemSubscription = {
  byFilter: Map<string, FilterSubscription>
}

type FilterSubscription = {
  filter: Record<string, unknown>
  subscribedClients: Array<SubscribedClient>
}

type SubscribedClient = {
  clientId: string
  update: () => void
}

function filterContains(
  triggerFilter: Record<string, unknown>,
  subscriptionFilter: Record<string, unknown>
): boolean {
  if (subscriptionFilter == null) return true // subscribe to all data
  if (triggerFilter == null) return true // all data modified

  for (const key of Object.keys(subscriptionFilter)) {
    if (triggerFilter[key] == undefined) continue
    if (subscriptionFilter[key] == triggerFilter[key]) continue

    if (Array.isArray(triggerFilter[key]) && Array.isArray(subscriptionFilter[key])) {
      if (safeStringify(triggerFilter[key]) == safeStringify(subscriptionFilter[key])) {
        continue
      }
    }

    return false
  }

  return true
}

function getFilterKey(parameters: unknown[]) {
  return safeStringify(parameters?.[0] ?? null)
}
